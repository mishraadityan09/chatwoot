// FlightsMojo: open-ticket counts per inbox, shown as badges in the sidebar
// Channels list. One conversations/meta request per inbox — no backend
// changes. Refreshed when the sidebar loads, on conversation created / status
// changed websocket events, and after a websocket reconnect.
import ConversationApi from '../../api/inbox/conversation';
import types from '../mutation-types';

export const FETCH_THROTTLE_MS = 5000;

// Trailing-edge throttle state. Module scope rather than store state because
// timers and timestamps aren't reactive data; account switch and logout are
// full page navigations, so nothing carries over between accounts.
let lastFetchAt = 0;
let pendingTimer = null;
let roundCounter = 0;
let committedRound = 0;

export const state = {
  counts: {},
};

export const getters = {
  getInboxOpenCount: $state => inboxId => {
    return $state.counts[String(inboxId)] || 0;
  },
};

const fetchInboxOpenCount = async inboxId => {
  const response = await ConversationApi.meta({ inboxId, status: 'open' });
  return Number(response.data?.meta?.all_count) || 0;
};

export const actions = {
  // A burst of websocket events collapses into at most one round every
  // FETCH_THROTTLE_MS, and the last burst always lands, so the badges settle
  // on the true count.
  fetch({ dispatch }) {
    const elapsed = Date.now() - lastFetchAt;
    if (elapsed >= FETCH_THROTTLE_MS) {
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      dispatch('fetchNow');
      return;
    }
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      dispatch('fetchNow');
    }, FETCH_THROTTLE_MS - elapsed);
  },
  fetchNow: async ({ commit, state: $state, rootGetters }) => {
    const inboxes = rootGetters['inboxes/getInboxes'] || [];
    if (!inboxes.length) return;

    lastFetchAt = Date.now();
    roundCounter += 1;
    const round = roundCounter;

    const results = await Promise.allSettled(
      inboxes.map(async inbox => [
        String(inbox.id),
        await fetchInboxOpenCount(inbox.id),
      ])
    );
    // A slow round must not overwrite a fresher one that has already
    // committed. Compared against the last *committed* round, not the last
    // started one, so rounds slower than the throttle still land instead of
    // being superseded forever while events keep arriving.
    if (round < committedRound) return;
    committedRound = round;

    // An inbox whose request failed keeps its last known count rather than
    // dropping to 0 — SidebarUnreadBadge hides at 0, which would make a busy
    // inbox look empty.
    const fresh = Object.fromEntries(
      results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
    );
    const next = { ...$state.counts, ...fresh };
    // The sidebar menu is one big computed; don't invalidate it when nothing
    // actually changed.
    const unchanged =
      Object.keys(next).length === Object.keys($state.counts).length &&
      Object.keys(next).every(id => next[id] === $state.counts[id]);
    if (unchanged) return;

    commit(types.SET_INBOX_OPEN_COUNTS, next);
  },
};

export const mutations = {
  [types.SET_INBOX_OPEN_COUNTS]($state, counts) {
    $state.counts = counts;
  },
};

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
};
