// FlightsMojo: Zendesk-style Play mode. "Play" in the ticket table header
// opens the first ticket of the current view; "Next ticket" on an open ticket
// opens the first ticket of the view — in its *live* order — that has not been
// played in this session. Using the live list means resolved or reassigned
// tickets that have left the view are skipped, and a new urgent ticket comes
// up next (the default sort is priority, oldest first). When the loaded
// tickets run out, Next asks the list for its next page (the list loads 25 at
// a time) and carries on, so Play covers the whole view. Stop or Back ends it.
//
// Module-level state: one Play session per browser tab; account switch and
// logout are full page loads.
import { computed, reactive, toValue, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMapGetter } from 'dashboard/composables/store';
import { useConversationRoutePath } from 'dashboard/composables/useConversationRoutePath';
import { isOnFoldersView } from 'dashboard/store/modules/conversations/helpers/actionHelpers';

export const MAX_EXTRA_PAGES = 5;
export const LOAD_TIMEOUT_MS = 10 * 1000;

const session = reactive({
  active: false,
  loading: false,
  played: new Set(),
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

/** Ends Play mode without navigating (e.g. the agent went Back). */
export const endPlay = () => {
  session.active = false;
  session.loading = false;
  session.played = new Set();
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
  const { buildConversationPath, buildConversationListPath } =
    useConversationRoutePath();
  const stats = useMapGetter('conversationStats/getStats');
  const listFilters = useMapGetter('getChatListFilters');

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

  const findNext = async (currentId, pagesLeft) => {
    const id = nextPlayableId(currentId);
    if (id !== null || pagesLeft === 0 || !hasMore()) return id;
    const grew = await loadMoreAndWait();
    return grew ? findNext(currentId, pagesLeft - 1) : null;
  };

  const open = id => {
    session.played.add(id);
    router.push(buildConversationPath(id));
  };

  const play = () => {
    const [first] = liveIds();
    if (first === undefined) return;
    session.active = true;
    session.played = new Set();
    session.listPath = buildConversationListPath();
    open(first);
  };

  const stop = () => {
    const path = session.listPath;
    endPlay();
    if (path) router.push(path);
  };

  const next = async currentId => {
    if (session.loading) return;
    if (currentId !== undefined && currentId !== null) {
      session.played.add(currentId);
    }
    session.loading = true;
    let id = null;
    try {
      id = await findNext(currentId, MAX_EXTRA_PAGES);
    } finally {
      session.loading = false;
    }
    if (!session.active) return; // stopped while loading
    if (id === null) {
      stop();
      return;
    }
    open(id);
  };

  const remainingCount = currentId => remainingIn(currentId, viewTotal.value);

  return { isPlaying, isLoadingNext, play, next, stop, remainingCount };
};

// Test hook.
export const resetPlay = () => {
  endPlay();
  liveIds = () => [];
  loadMore = () => {};
};
