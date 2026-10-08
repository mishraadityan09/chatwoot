// FlightsMojo: total matching tickets per folder (saved filter), shown as
// sidebar badges like Zendesk's view counts ("Your unsolved tickets 40").
//
// Why not upstream's folder counts: #14726 was reverted for overloading the
// database; the re-land (#14885) sits behind two feature flags, counts only
// *unread* conversations, and can be minutes stale.
//
// How: one POST /conversations/filter per folder with the folder's own query
// and a page far past the end. The endpoint computes mine/unassigned/all counts
// over the whole filtered set before paginating, so meta.all_count is exact
// while the payload is empty (nothing serialised). No backend changes.
//
// Load control: trailing-edge throttle (one round per FETCH_THROTTLE_MS, the
// last burst always lands), at most MAX_IN_FLIGHT requests at once, nothing
// while the browser tab is hidden (one catch-up round when it becomes
// visible). Triggers: the sidebar's folder list changing, upstream's
// `fetch_conversation_stats` bus event (conversation created / status /
// assignee / updated websocket events) and websocket reconnects — so
// actionCable.js and ReconnectService.js need no edits.
//
// State is module-level rather than Vuex: one sidebar per page, and account
// switch / logout are full page loads, so nothing carries over.
import { onBeforeUnmount, onMounted, ref, toValue, watch } from 'vue';
import ConversationApi from 'dashboard/api/inbox/conversation';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';

// 60 s (was 30 s; raised 8 Oct 2026): every open tab recounts every folder
// each round, and each count scans the whole open backlog, so the load is
// agents × folders × backlog. At ~3000 tickets/day something always changes,
// so rounds run at this rate all day; a badge at most a minute stale is fine.
export const FETCH_THROTTLE_MS = 60 * 1000;
export const MAX_IN_FLIGHT = 3;
export const COUNT_ONLY_PAGE = 100000;
const STATS_EVENT = 'fetch_conversation_stats';

const counts = ref({});
let folders = [];
let lastFetchAt = 0;
let pendingTimer = null;
let roundCounter = 0;
let committedRound = 0;
let missedWhileHidden = false;

const isHidden = () =>
  typeof document !== 'undefined' && document.visibilityState === 'hidden';

export const fetchFolderCount = async folder => {
  const { data } = await ConversationApi.filter({
    queryData: folder.query,
    page: COUNT_ONLY_PAGE,
  });
  return Number(data?.meta?.all_count) || 0;
};

// Promise.allSettled with at most `limit` promises running at once.
// Each worker takes the next item when its current one settles.
export const settleWithLimit = (items, limit, task) => {
  const results = new Array(items.length);
  let next = 0;
  const runNext = () => {
    if (next >= items.length) return Promise.resolve();
    const index = next;
    next += 1;
    return Promise.resolve()
      .then(() => task(items[index]))
      .then(
        value => {
          results[index] = { status: 'fulfilled', value };
        },
        reason => {
          results[index] = { status: 'rejected', reason };
        }
      )
      .then(runNext);
  };
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    runNext
  );
  return Promise.all(workers).then(() => results);
};

export const fetchNow = async () => {
  if (!folders.length) return;
  if (isHidden()) {
    missedWhileHidden = true;
    return;
  }

  lastFetchAt = Date.now();
  roundCounter += 1;
  const round = roundCounter;
  const current = folders;

  const results = await settleWithLimit(current, MAX_IN_FLIGHT, folder =>
    fetchFolderCount(folder)
  );
  // A slow round must not overwrite a fresher one that already committed.
  if (round < committedRound) return;
  committedRound = round;

  // A folder whose request failed keeps its last known count rather than
  // dropping to 0 (the badge hides at 0, which would look like an empty view).
  const next = { ...counts.value };
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      next[String(current[index].id)] = result.value;
    }
  });
  const unchanged =
    Object.keys(next).length === Object.keys(counts.value).length &&
    Object.keys(next).every(id => next[id] === counts.value[id]);
  if (!unchanged) counts.value = next;
};

export const requestFetch = () => {
  const elapsed = Date.now() - lastFetchAt;
  if (elapsed >= FETCH_THROTTLE_MS) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    fetchNow();
    return;
  }
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    fetchNow();
  }, FETCH_THROTTLE_MS - elapsed);
};

export const getFolderCount = folderId => counts.value[String(folderId)] || 0;

/**
 * Called once by the sidebar with its list of conversation folders.
 * @param {import('vue').MaybeRefOrGetter<Array>} folderList
 * @returns {{ getFolderCount: (folderId: number|string) => number }}
 */
export const useFolderCounts = folderList => {
  // Re-count when a folder is added, removed or its filter edited.
  watch(
    () => {
      const list = toValue(folderList) || [];
      return list.map(view => `${view.id}:${view.updated_at}`).join(',');
    },
    key => {
      folders = toValue(folderList) || [];
      if (key) requestFetch();
    },
    { immediate: true }
  );

  const onVisibilityChange = () => {
    if (!isHidden() && missedWhileHidden) {
      missedWhileHidden = false;
      requestFetch();
    }
  };

  onMounted(() => {
    emitter.on(STATS_EVENT, requestFetch);
    emitter.on(BUS_EVENTS.WEBSOCKET_RECONNECT, requestFetch);
    document.addEventListener('visibilitychange', onVisibilityChange);
  });
  onBeforeUnmount(() => {
    emitter.off(STATS_EVENT, requestFetch);
    emitter.off(BUS_EVENTS.WEBSOCKET_RECONNECT, requestFetch);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });

  return { getFolderCount };
};

// Test hook: module state is per page load.
export const resetFolderCounts = () => {
  counts.value = {};
  folders = [];
  lastFetchAt = 0;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  roundCounter = 0;
  committedRound = 0;
  missedWhileHidden = false;
};
