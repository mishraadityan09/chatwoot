/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, nextTick, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FmTicketTabs from '../FmTicketTabs.vue';
import {
  MAX_TABS,
  OWN_RESOLVE_MS,
  closeTab,
  idsResolvedBy,
  loadTabs,
  openTab,
  resetTicketTabs,
  storageKey,
  useTicketTabs,
} from '../useTicketTabs';

const route = reactive({ name: 'home', params: {}, fullPath: '/list' });
const push = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}));

const chats = reactive({});
const dispatch = vi.fn();
const actionSubscribers = [];
vi.mock('dashboard/composables/store', () => ({
  useStore: () => ({
    dispatch,
    getters: {
      getCurrentAccountId: 2,
      getCurrentUser: { id: 3 },
      getConversationById: id => chats[id],
    },
    subscribeAction: subscriber => {
      actionSubscribers.push(subscriber);
      return () =>
        actionSubscribers.splice(actionSubscribers.indexOf(subscriber), 1);
    },
  }),
}));

// Runs a store action the way Vuex does: `before` hooks, the action's own
// commit (applied here), the watchers, then `after` hooks.
const runAction = async (type, payload, commit = () => {}) => {
  actionSubscribers.forEach(sub => sub.before?.({ type, payload }));
  commit();
  await nextTick();
  actionSubscribers.forEach(sub => sub.after?.({ type, payload }));
  await nextTick();
};
const chat = (id, status = 'open') => {
  chats[id] = {
    id,
    status,
    unread_count: 0,
    meta: { sender: { name: `Traveller ${id}` } },
    additional_attributes: {},
  };
};
const setStatus = async (id, status) => {
  chats[id].status = status;
  await nextTick();
};

const KEY = storageKey(2, 3);
const goTo = async (name, fullPath, conversationId) => {
  route.name = name;
  route.params = conversationId ? { conversation_id: conversationId } : {};
  route.fullPath = fullPath;
  await nextTick();
};
const ticketRoute = id => [
  'conversations_through_folders',
  `/app/accounts/2/custom_view/8/conversations/${id}`,
  String(id),
];

let api;
let wrapper;
const mountTabs = () => {
  wrapper = mount(
    defineComponent({
      setup() {
        api = useTicketTabs();
        return () => h('div');
      },
    })
  );
};

beforeEach(() => {
  resetTicketTabs();
  window.localStorage.clear();
  push.mockClear();
  dispatch.mockReset();
  actionSubscribers.length = 0;
  Object.keys(chats).forEach(id => delete chats[id]);
  route.name = 'folder_conversations';
  route.params = {};
  route.fullPath = '/app/accounts/2/custom_view/8';
});
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('tab list helpers', () => {
  it('adds tabs once, updating the path of an existing one', () => {
    openTab(1, '/a/1');
    openTab(2, '/a/2');
    openTab(1, '/b/1');
    mountTabs();

    expect(api.tabs.value).toEqual([
      { id: 1, path: '/b/1' },
      { id: 2, path: '/a/2' },
    ]);
  });

  it('drops the oldest other tab beyond the limit', () => {
    for (let id = 1; id <= MAX_TABS + 1; id += 1) openTab(id, `/t/${id}`);
    mountTabs();

    expect(api.tabs.value).toHaveLength(MAX_TABS);
    expect(api.tabs.value[0].id).toBe(2);
  });

  it('closing the active tab moves right, then left, then to the list', () => {
    openTab(1, '/t/1');
    openTab(2, '/t/2');
    openTab(3, '/t/3');

    expect(closeTab(2, 2)).toBe('/t/3');
    expect(closeTab(3, 3)).toBe('/t/1');
    expect(closeTab(1, 1)).toBeNull(); // no list visited yet
    expect(closeTab(9, 1)).toBeNull(); // unknown tab
  });

  it('closing another tab stays where the agent is', () => {
    openTab(1, '/t/1');
    openTab(2, '/t/2');

    expect(closeTab(1, 2)).toBeNull();
  });

  it('reads stored tabs defensively', () => {
    window.localStorage.setItem('bad', '{oops');
    expect(loadTabs('bad')).toEqual({ tabs: [], lastListPath: '' });

    window.localStorage.setItem(
      'mixed',
      JSON.stringify({
        tabs: [{ id: 1, path: '/1' }, { id: 'x' }, null],
        lastListPath: '/l',
      })
    );
    expect(loadTabs('mixed')).toEqual({
      tabs: [{ id: 1, path: '/1' }],
      lastListPath: '/l',
    });
  });
});

describe('useTicketTabs', () => {
  it('opens a tab for each ticket the agent visits and remembers the list', async () => {
    mountTabs();
    await goTo(...ticketRoute(157));
    await goTo(...ticketRoute(121));

    expect(api.tabs.value.map(tab => tab.id)).toEqual([157, 121]);
    expect(api.activeId.value).toBe(121);
    expect(JSON.parse(window.localStorage.getItem(KEY))).toMatchObject({
      tabs: [{ id: 157 }, { id: 121 }],
      lastListPath: '/app/accounts/2/custom_view/8',
    });
  });

  it('Views goes back to the last list', async () => {
    mountTabs();
    await goTo(...ticketRoute(157));
    api.openViews();

    expect(push).toHaveBeenCalledWith('/app/accounts/2/custom_view/8');
  });

  it('restores tabs after a reload and fetches their tickets', () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ tabs: [{ id: 130, path: '/t/130' }], lastListPath: '' })
    );
    route.name = 'contacts_dashboard_index';
    mountTabs();

    expect(api.tabs.value).toEqual([{ id: 130, path: '/t/130' }]);
    expect(dispatch).toHaveBeenCalledWith('getConversation', 130);
  });

  it('keeps a label when the store forgets the ticket', async () => {
    chats[157] = {
      id: 157,
      status: 'open',
      unread_count: 2,
      meta: { sender: { name: 'Traveller 1144' } },
      additional_attributes: { subject: 'Name correction' },
    };
    mountTabs();
    await goTo(...ticketRoute(157));
    await nextTick();
    delete chats[157]; // a list reset emptied the store
    await nextTick();

    expect(api.info(157)).toEqual({
      name: 'Traveller 1144',
      status: 'open',
      unread: true,
      subject: 'Name correction',
    });
    expect(dispatch).not.toHaveBeenCalledWith('getConversation', 157);
  });

  it('does not keep refetching a ticket that fails to load', async () => {
    mountTabs();
    await goTo(...ticketRoute(404));
    await flushPromises();
    chats[1] = { id: 1 }; // unrelated store change
    await nextTick();
    await flushPromises();

    expect(dispatch.mock.calls.filter(([, id]) => id === 404)).toHaveLength(1);
  });
});

describe('resolved tickets leave the bar', () => {
  const ids = () => api.tabs.value.map(tab => tab.id);
  // Mounts the bar, then visits each ticket in turn.
  const openTickets = async (...list) => {
    mountTabs();
    await list.reduce(async (previous, id) => {
      await previous;
      if (!chats[id]) chat(id);
      await goTo(...ticketRoute(id));
    }, Promise.resolve());
  };
  const resolveHere = (id, commit = () => setStatus(id, 'resolved')) =>
    runAction(
      'toggleStatus',
      { conversationId: id, status: 'resolved' },
      commit
    );

  it('reads which tickets an action resolves', () => {
    expect(
      idsResolvedBy({
        type: 'toggleStatus',
        payload: { conversationId: 5, status: 'resolved' },
      })
    ).toEqual([5]);
    expect(
      idsResolvedBy({
        type: 'toggleStatus',
        payload: { conversationId: 5, status: 'snoozed' },
      })
    ).toEqual([]);
    expect(
      idsResolvedBy({
        type: 'bulkActions/process',
        payload: {
          type: 'Conversation',
          ids: [5, 6],
          fields: { status: 'resolved' },
        },
      })
    ).toEqual([5, 6]);
    expect(
      idsResolvedBy({
        type: 'bulkActions/process',
        payload: {
          type: 'Conversation',
          ids: 7,
          fields: { status: 'resolved' },
        },
      })
    ).toEqual([7]);
    expect(
      idsResolvedBy({
        type: 'bulkActions/process',
        payload: { type: 'Conversation', ids: [5], fields: { assignee_id: 1 } },
      })
    ).toEqual([]);
    expect(idsResolvedBy({ type: 'getConversation', payload: 5 })).toEqual([]);
    expect(idsResolvedBy()).toEqual([]);
  });

  it('own resolve of the ticket on screen closes it and opens the next tab', async () => {
    await openTickets(1, 2, 3);
    await goTo(...ticketRoute(2));
    await resolveHere(2);

    expect(ids()).toEqual([1, 3]);
    expect(push).toHaveBeenCalledWith(ticketRoute(3)[1]);
    expect(
      JSON.parse(window.localStorage.getItem(KEY)).tabs.map(t => t.id)
    ).toEqual([1, 3]);
  });

  it('own resolve of the last tab stays on the ticket when no list was visited', async () => {
    resetTicketTabs();
    route.name = 'contacts_dashboard_index';
    route.fullPath = '/app/accounts/2/contacts';
    await openTickets(4);
    await resolveHere(4);

    expect(ids()).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it('on a small screen the tab closes without jumping to another ticket', async () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    try {
      await openTickets(1, 2);
      await resolveHere(2);

      expect(ids()).toEqual([1]);
      expect(push).not.toHaveBeenCalled();
      expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 768px)');
    } finally {
      delete window.matchMedia;
    }
  });

  it('a failed resolve (e.g. Booking ID missing) keeps the tab and is not counted as own', async () => {
    await openTickets(1, 2);
    await resolveHere(2, () => {}); // the API refused: no status change

    expect(ids()).toEqual([1, 2]);
    // A colleague resolves it a moment later while the agent is on it: stays.
    await setStatus(2, 'resolved');
    expect(ids()).toEqual([1, 2]);
    expect(push).not.toHaveBeenCalled();
  });

  it('an off-screen tab closes at once when anyone resolves its ticket', async () => {
    await openTickets(1, 2, 3);
    await setStatus(1, 'resolved'); // colleague, bot, other window

    expect(ids()).toEqual([2, 3]);
    expect(push).not.toHaveBeenCalled();
  });

  it('the ticket on screen, resolved by someone else, stays until the agent moves on', async () => {
    await openTickets(1, 2);
    await setStatus(2, 'resolved');

    expect(ids()).toEqual([1, 2]);
    expect(push).not.toHaveBeenCalled();
    await goTo(...ticketRoute(1));
    expect(ids()).toEqual([1]);
  });

  it('...and stays for good if it was reopened before the agent moved on', async () => {
    await openTickets(1, 2);
    await setStatus(2, 'resolved');
    await setStatus(2, 'open');
    await goTo(...ticketRoute(1));

    expect(ids()).toEqual([1, 2]);
  });

  it('...and also goes when the agent moves to a list', async () => {
    await openTickets(1, 2);
    await setStatus(2, 'resolved');
    await goTo('folder_conversations', '/app/accounts/2/custom_view/8');

    expect(ids()).toEqual([1]);
  });

  it('a bulk resolve that includes the ticket on screen jumps to a tab that stays', async () => {
    await openTickets(1, 2, 3);
    await goTo(...ticketRoute(2));
    // Bulk statuses arrive later by websocket, after the action has returned.
    await runAction('bulkActions/process', {
      type: 'Conversation',
      ids: [2, 3],
      fields: { status: 'resolved' },
    });
    chats[2].status = 'resolved';
    chats[3].status = 'resolved';
    await nextTick();

    expect(ids()).toEqual([1]);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(ticketRoute(1)[1]);
  });

  it('the own-resolve mark expires', async () => {
    const now = vi.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_000_000);
      await openTickets(1, 2);
      delete chats[2]; // not in the store when the answer comes: mark kept
      await runAction('toggleStatus', {
        conversationId: 2,
        status: 'resolved',
      });
      now.mockReturnValue(1_000_000 + OWN_RESOLVE_MS + 1);
      chat(2, 'resolved'); // much later, resolved by someone else
      await nextTick();

      expect(ids()).toEqual([1, 2]); // on screen: stays
      expect(push).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('a ticket the store dropped comes back resolved: its tab closes', async () => {
    await openTickets(1, 2);
    delete chats[1]; // a list reload emptied the store
    await nextTick();
    chat(1, 'resolved'); // the websocket update re-adds it
    await nextTick();

    expect(ids()).toEqual([2]);
  });

  it('only resolved closes a tab: snoozed and pending stay', async () => {
    await openTickets(1, 2, 3);
    await setStatus(1, 'snoozed');
    await setStatus(2, 'pending');

    expect(ids()).toEqual([1, 2, 3]);
  });

  it('opening an already resolved ticket keeps its tab, also after moving on', async () => {
    chat(5, 'resolved');
    await openTickets(5, 6);

    expect(ids()).toEqual([5, 6]);
  });

  it('after a reload, off-screen tabs resolved meanwhile are dropped; the one on screen stays', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        tabs: [
          { id: 7, path: '/t/7' },
          { id: 8, path: '/t/8' },
          { id: 9, path: ticketRoute(9)[1] },
        ],
        lastListPath: '/app/accounts/2/custom_view/8',
      })
    );
    chat(7, 'resolved');
    chat(8, 'open');
    chat(9, 'resolved');
    [route.name, route.fullPath] = ticketRoute(9);
    route.params = { conversation_id: '9' };
    mountTabs();
    await nextTick();

    expect(ids()).toEqual([8, 9]);
    expect(push).not.toHaveBeenCalled();
  });

  it('a reloaded tab whose ticket loads later, resolved, is dropped too', async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        tabs: [
          { id: 10, path: '/t/10' },
          { id: 11, path: '/t/11' },
        ],
        lastListPath: '',
      })
    );
    chat(11, 'open');
    route.name = 'contacts_dashboard_index';
    mountTabs();
    expect(dispatch).toHaveBeenCalledWith('getConversation', 10);
    chat(10, 'resolved'); // the fetch answered
    await nextTick();

    expect(ids()).toEqual([11]);
  });

  it('stops listening to store actions when the bar goes away', async () => {
    await openTickets(1);
    expect(actionSubscribers).toHaveLength(1);
    wrapper.unmount();
    wrapper = null;
    expect(actionSubscribers).toHaveLength(0);
  });
});

describe('FmTicketTabs', () => {
  it('renders nothing until a ticket has been opened', () => {
    const bar = mount(FmTicketTabs);
    expect(bar.find('[data-test-id="ticket-tabs"]').exists()).toBe(false);
  });

  it('shows a tab per ticket, closes on × and on middle click', async () => {
    openTab(1, '/t/1');
    openTab(2, '/t/2');
    const bar = mount(FmTicketTabs);
    const tabs = () => bar.findAll('[data-test-id="ticket-tab"]');

    expect(tabs()).toHaveLength(2);
    await tabs()[0].find('[data-test-id="ticket-tab-close"]').trigger('click');
    expect(tabs()).toHaveLength(1);
    await tabs()[0].trigger('auxclick', { button: 1 });
    expect(bar.find('[data-test-id="ticket-tabs"]').exists()).toBe(false);
  });
});
