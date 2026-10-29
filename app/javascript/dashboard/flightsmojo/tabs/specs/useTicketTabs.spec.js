/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, nextTick, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FmTicketTabs from '../FmTicketTabs.vue';
import {
  MAX_TABS,
  closeTab,
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
vi.mock('dashboard/composables/store', () => ({
  useStore: () => ({
    dispatch,
    getters: {
      getCurrentAccountId: 2,
      getCurrentUser: { id: 3 },
      getConversationById: id => chats[id],
    },
  }),
}));

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
