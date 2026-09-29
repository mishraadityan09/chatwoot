// FlightsMojo: in-app ticket tabs, like Zendesk's top bar. Every ticket the
// agent opens gets a tab (up to MAX_TABS; the oldest inactive one drops off);
// a "Views" tab goes back to the last conversation list. Tabs follow the route
// (no upstream code calls in), are kept per account + agent in localStorage
// so they survive a reload, and store only ids and paths there. Labels come
// live from the conversations store; an in-memory copy per tab (never
// persisted — it holds customer names) covers the moments the store doesn't
// have the ticket (opening a list empties it), and a ticket in neither place
// is fetched.
import { computed, reactive, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useStore } from 'dashboard/composables/store';
import { frontendURL } from 'dashboard/helper/URLHelper';
import { isAConversationRoute } from 'dashboard/helper/routeHelpers';
import { getTicketSubject } from '../helpers/ticket';

export const MAX_TABS = 12;
const STORAGE_PREFIX = 'fm.ticketTabs';

const state = reactive({ key: '', tabs: [], lastListPath: '', info: {} });
const inFlight = new Set();

const infoFrom = chat => ({
  name: chat.meta?.sender?.name || '',
  status: chat.status || '',
  unread: (chat.unread_count || 0) > 0,
  subject: getTicketSubject(chat),
});

export const conversationIdOf = route => {
  const id = route?.params?.conversation_id ?? route?.params?.conversationId;
  const number = Number(id);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const isTicketRoute = route => isAConversationRoute(route?.name, false, true);
const isListRoute = route => isAConversationRoute(route?.name, true, false);

export const storageKey = (accountId, userId) =>
  `${STORAGE_PREFIX}.${accountId}.${userId}`;

export const loadTabs = key => {
  try {
    const data = JSON.parse(window.localStorage.getItem(key) || 'null');
    const tabs = Array.isArray(data?.tabs) ? data.tabs : [];
    return {
      tabs: tabs
        .filter(
          tab => Number.isInteger(tab?.id) && typeof tab.path === 'string'
        )
        .slice(-MAX_TABS),
      lastListPath:
        typeof data?.lastListPath === 'string' ? data.lastListPath : '',
    };
  } catch {
    return { tabs: [], lastListPath: '' };
  }
};

const saveTabs = () => {
  if (!state.key) return;
  try {
    window.localStorage.setItem(
      state.key,
      JSON.stringify({ tabs: state.tabs, lastListPath: state.lastListPath })
    );
  } catch {
    // Storage full or blocked: tabs just won't survive a reload.
  }
};

/** Adds (or updates the path of) a ticket tab; evicts the oldest others. */
export const openTab = (id, path) => {
  const existing = state.tabs.find(tab => tab.id === id);
  if (existing) {
    existing.path = path;
  } else {
    state.tabs.push({ id, path });
  }
  while (state.tabs.length > MAX_TABS) {
    const index = state.tabs.findIndex(tab => tab.id !== id);
    state.tabs.splice(index, 1);
  }
};

/**
 * Removes a tab. When it was the active one, returns where to go next: the
 * tab to its right, else to its left, else the last list; otherwise null.
 */
export const closeTab = (id, activeId) => {
  const index = state.tabs.findIndex(tab => tab.id === id);
  if (index === -1) return null;
  state.tabs.splice(index, 1);
  delete state.info[id];
  if (id !== activeId) return null;
  const neighbour = state.tabs[index] || state.tabs[index - 1];
  return neighbour ? neighbour.path : state.lastListPath || null;
};

export const useTicketTabs = () => {
  const route = useRoute();
  const router = useRouter();
  // Read through `store?.` so the bar is simply inert where no store is
  // installed (e.g. upstream's Dashboard.spec mounts the shell without one).
  const store = useStore();
  const accountId = computed(() => store?.getters?.getCurrentAccountId);
  const currentUser = computed(() => store?.getters?.getCurrentUser);

  // Load this account + agent's tabs once both are known.
  watch(
    () => [accountId.value, currentUser.value?.id],
    ([account, user]) => {
      if (!account || !user) return;
      const key = storageKey(account, user);
      if (state.key === key) return;
      state.key = key;
      // Merge rather than replace: a ticket opened before the agent's data
      // arrived keeps its tab.
      const saved = loadTabs(key);
      const opened = state.tabs.filter(
        tab => !saved.tabs.some(savedTab => savedTab.id === tab.id)
      );
      state.tabs = [...saved.tabs, ...opened].slice(-MAX_TABS);
      state.lastListPath = state.lastListPath || saved.lastListPath;
      saveTabs();
    },
    { immediate: true }
  );

  // Follow the route: a ticket opens / activates its tab, a list becomes
  // the target of the Views tab.
  watch(
    () => route.fullPath,
    () => {
      const id = conversationIdOf(route);
      if (id && isTicketRoute(route)) {
        openTab(id, route.fullPath);
        saveTabs();
      } else if (isListRoute(route)) {
        state.lastListPath = route.fullPath;
        saveTabs();
      }
    },
    { immediate: true }
  );

  const chatOf = id => store?.getters?.getConversationById?.(id);

  // Keep each tab's label copy fresh while the store has the ticket, and
  // fetch tickets that are in neither place (e.g. restored after a reload).
  watch(
    () =>
      state.tabs.map(({ id }) => {
        const chat = chatOf(id);
        return chat ? infoFrom(chat) : null;
      }),
    live => {
      live.forEach((info, index) => {
        const { id } = state.tabs[index];
        if (info) {
          state.info[id] = info;
        } else if (!state.info[id] && !inFlight.has(id)) {
          inFlight.add(id);
          Promise.resolve(store?.dispatch('getConversation', id)).finally(
            () => {
              inFlight.delete(id);
              // Deleted or inaccessible: remember a blank label so we don't
              // retry on every store change.
              if (!chatOf(id) && !state.info[id]) {
                state.info[id] = {
                  name: '',
                  status: '',
                  unread: false,
                  subject: '',
                };
              }
            }
          );
        }
      });
    },
    { immediate: true, deep: true }
  );

  const activeId = computed(() => conversationIdOf(route));
  const isOnList = computed(() => !activeId.value && isListRoute(route));

  const open = tab => {
    if (tab.id !== activeId.value) router.push(tab.path);
  };
  const close = id => {
    const target = closeTab(id, activeId.value);
    saveTabs();
    if (target) router.push(target);
  };
  const openViews = () =>
    router.push(
      state.lastListPath || frontendURL(`accounts/${accountId.value}/dashboard`)
    );

  return {
    tabs: computed(() => state.tabs),
    activeId,
    isOnList,
    open,
    close,
    openViews,
    /** name / status / unread / subject for a tab, or null if unknown yet */
    info: id => {
      const chat = chatOf(id);
      return chat ? infoFrom(chat) : state.info[id] || null;
    },
  };
};

// Test hook.
export const resetTicketTabs = () => {
  state.key = '';
  state.tabs = [];
  state.lastListPath = '';
  state.info = {};
  inFlight.clear();
};
