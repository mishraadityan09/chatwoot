// FlightsMojo: Zendesk-style Play mode. "Play" in the ticket table header
// opens the first ticket of the current view; "Next ticket" on an open ticket
// opens the first ticket of the view — in its *live* order — that has not been
// played in this session. Using the live list means resolved or reassigned
// tickets that have left the view are skipped, and a new urgent ticket comes
// up next (the default sort is priority, oldest first). When the loaded
// tickets run out, Next asks the list for its next page (the list loads 25 at
// a time) and carries on, so Play covers the whole view. Stop or Back ends it.
//
// Several agents playing one shared view: Zendesk skips tickets another agent
// is *viewing*; Chatwoot has no live "who is viewing" signal, so Play claims
// instead (user decision, 29 Sep 2026):
// - an OPEN, UNASSIGNED ticket is assigned to the agent when Play opens it,
//   so it leaves colleagues' shared views (and their Play) within a second;
// - a ticket that already belongs to someone else is skipped, not taken;
// - pending (bot-handled) tickets are opened but never claimed;
// - leaving a ticket Play claimed (Next / Stop / Back) without having written
//   anything (reply or private note) releases it back to unassigned, as long
//   as it is still open and still assigned to the agent, so skipping does not
//   hoard tickets.
// Uses the same assignAgent store action as the assignee menu (agentId null
// unassigns); no API change. Before claiming or releasing, the ticket is
// re-read from the server (getConversation), so a colleague's claim that has
// not reached this screen over the websocket yet is never overwritten.
//
// Module-level state: one Play session per browser tab; account switch and
// logout are full page loads.
import { computed, reactive, toValue, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useConversationRoutePath } from 'dashboard/composables/useConversationRoutePath';
import { isOnFoldersView } from 'dashboard/store/modules/conversations/helpers/actionHelpers';

export const MAX_EXTRA_PAGES = 5;
export const LOAD_TIMEOUT_MS = 10 * 1000;
// Message timestamps come from the server; allow for clock drift.
const CLOCK_SKEW_SECONDS = 5;
const OUTGOING = 1;
const TEMPLATE = 3;

const session = reactive({
  active: false,
  loading: false,
  played: new Set(),
  claimed: new Map(), // conversation id -> unix seconds when Play claimed it
  currentId: null,
  listPath: '',
});

// Registered by the ticket table (ConversationList): the view's rows in
// display order, and a way to ask it for the next page.
let liveIds = () => [];
let loadMore = () => {};
export const setPlayLiveList = (list, options = {}) => {
  liveIds = () => (toValue(list) || []).map(chat => chat.id);
  loadMore = options.loadMore || (() => {});
};

export const isPlaying = computed(() => session.active);
export const isLoadingNext = computed(() => session.loading);

/** First loaded ticket in the live view that is neither played nor current. */
export const nextPlayableId = (currentId, ids = liveIds()) =>
  ids.find(id => id !== currentId && !session.played.has(id)) ?? null;

/**
 * Tickets left to play, excluding the current one: the view's total minus the
 * played tickets still in it (a played ticket that was resolved has left both
 * the total and the list). Falls back to the loaded rows when the total is
 * unknown.
 */
export const remainingIn = (currentId, viewTotal, ids = liveIds()) => {
  const loadedLeft = ids.filter(
    id => id !== currentId && !session.played.has(id)
  ).length;
  const total = Number(viewTotal);
  if (!Number.isFinite(total) || total <= 0) return loadedLeft;
  const playedInView = ids.filter(id => session.played.has(id)).length;
  const currentUnplayed =
    ids.includes(currentId) && !session.played.has(currentId) ? 1 : 0;
  return Math.max(total - playedInView - currentUnplayed, loadedLeft);
};

/** Did `userId` write on this ticket (reply or private note) since `since`? */
export const wroteSince = (chat, userId, since) =>
  (chat?.messages || []).some(
    message =>
      [OUTGOING, TEMPLATE].includes(message.message_type) &&
      (message.sender?.id ?? message.sender_id) === userId &&
      Number(message.created_at) >= since - CLOCK_SKEW_SECONDS
  );

const resetSession = () => {
  session.active = false;
  session.loading = false;
  session.played = new Set();
  session.claimed = new Map();
  session.currentId = null;
  session.listPath = '';
};

// Resolves true once the list has grown, false after LOAD_TIMEOUT_MS.
const loadMoreAndWait = () =>
  new Promise(resolve => {
    const before = liveIds().length;
    let timer = null;
    const stopWatching = watch(
      () => liveIds().length,
      length => {
        if (length <= before) return;
        clearTimeout(timer);
        stopWatching();
        resolve(true);
      }
    );
    timer = setTimeout(() => {
      stopWatching();
      resolve(false);
    }, LOAD_TIMEOUT_MS);
    loadMore();
  });

export const usePlayQueue = () => {
  const router = useRouter();
  const store = useStore();
  const { buildConversationPath, buildConversationListPath } =
    useConversationRoutePath();
  const stats = useMapGetter('conversationStats/getStats');
  const listFilters = useMapGetter('getChatListFilters');
  const currentUser = useMapGetter('getCurrentUser');

  // The count the list shows for this view: the folder's total, or the
  // active Mine / Unassigned / All tab.
  const viewTotal = computed(() => {
    const counts = stats.value || {};
    const routeName = router.currentRoute?.value?.name;
    if (isOnFoldersView({ route: { name: routeName } })) return counts.allCount;
    const byTab = {
      me: counts.mineCount,
      unassigned: counts.unAssignedCount,
      all: counts.allCount,
    };
    return byTab[listFilters.value?.assigneeType] ?? counts.allCount;
  });

  const hasMore = () => liveIds().length < Number(viewTotal.value || 0);
  const myId = () => currentUser.value?.id;
  const chatById = id => store.getters.getConversationById?.(id);

  const findNext = async (currentId, pagesLeft) => {
    const id = nextPlayableId(currentId);
    if (id !== null || pagesLeft === 0 || !hasMore()) return id;
    const grew = await loadMoreAndWait();
    return grew ? findNext(currentId, pagesLeft - 1) : null;
  };

  const isClaimable = chat =>
    !chat?.meta?.assignee?.id && chat?.status === 'open';
  const ownedByOther = chat => {
    const assigneeId = chat?.meta?.assignee?.id;
    return !!assigneeId && assigneeId !== myId();
  };

  // Opens a ticket, claiming it when it is open and unassigned. Returns false
  // (and marks it played) when it already belongs to someone else.
  const openTicket = async id => {
    session.played.add(id);
    if (ownedByOther(chatById(id))) return false;

    if (isClaimable(chatById(id)) && myId()) {
      // Fresh state from the server, in case a colleague just claimed it.
      await store.dispatch('getConversation', id);
      const fresh = chatById(id);
      if (ownedByOther(fresh)) return false;
      if (isClaimable(fresh)) {
        session.claimed.set(id, Math.floor(Date.now() / 1000));
        store.dispatch('assignAgent', { conversationId: id, agentId: myId() });
      }
    }
    session.currentId = id;
    router.push(buildConversationPath(id));
    return true;
  };

  // Gives back a ticket Play claimed if the agent left it untouched.
  const releaseIfUntouched = async id => {
    const claimedAt = session.claimed.get(id);
    if (claimedAt === undefined) return;
    session.claimed.delete(id);
    await store.dispatch('getConversation', id);
    const chat = chatById(id);
    if (!chat || chat.status !== 'open') return;
    if (chat.meta?.assignee?.id !== myId()) return;
    if (wroteSince(chat, myId(), claimedAt)) return;
    store.dispatch('assignAgent', { conversationId: id, agentId: null });
  };

  const stop = () => {
    const path = session.listPath;
    releaseIfUntouched(session.currentId);
    resetSession();
    if (path) router.push(path);
  };

  /** Ends Play without navigating (the agent went Back to the list). */
  const leave = () => {
    if (!session.active) return;
    releaseIfUntouched(session.currentId);
    resetSession();
  };

  const openFrom = async (currentId, pagesLeft = MAX_EXTRA_PAGES) => {
    const id = await findNext(currentId, pagesLeft);
    if (!session.active) return; // stopped while loading
    if (id === null) {
      stop();
      return;
    }
    // Someone else owns it: skip to the one after.
    if (!(await openTicket(id))) await openFrom(currentId, pagesLeft);
  };

  const play = async () => {
    if (!liveIds().length) return;
    session.active = true;
    session.played = new Set();
    session.claimed = new Map();
    session.listPath = buildConversationListPath();
    session.loading = true;
    try {
      await openFrom(null);
    } finally {
      session.loading = false;
    }
  };

  const next = async currentId => {
    if (session.loading || !session.active) return;
    if (currentId !== undefined && currentId !== null) {
      session.played.add(currentId);
      // Not awaited: the release must not delay the next ticket.
      releaseIfUntouched(currentId);
    }
    session.loading = true;
    try {
      await openFrom(currentId);
    } finally {
      session.loading = false;
    }
  };

  const remainingCount = currentId => remainingIn(currentId, viewTotal.value);

  return {
    isPlaying,
    isLoadingNext,
    play,
    next,
    stop,
    leave,
    remainingCount,
  };
};

// Test hook.
export const resetPlay = () => {
  resetSession();
  liveIds = () => [];
  loadMore = () => {};
};
