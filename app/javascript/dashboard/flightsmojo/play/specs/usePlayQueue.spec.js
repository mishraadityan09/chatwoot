/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FmPlayControls from '../FmPlayControls.vue';
import {
  isPlaying,
  nextPlayableId,
  remainingIn,
  resetPlay,
  setPlayLiveList,
  usePlayQueue,
  wroteSince,
} from '../usePlayQueue';

const ME = 7;
const push = vi.fn();
const routeName = ref('folder_conversations');
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push,
    currentRoute: { value: { name: routeName.value } },
  }),
}));
vi.mock('dashboard/composables/useConversationRoutePath', () => ({
  useConversationRoutePath: () => ({
    buildConversationPath: id => `/folder/8/conversations/${id}`,
    buildConversationListPath: () => '/folder/8',
  }),
}));

const stats = ref({ allCount: 3, mineCount: 0, unAssignedCount: 0 });
const listFilters = ref({ assigneeType: 'me' });
const currentUser = ref({ id: ME });
const chats = {};
const dispatch = vi.fn();
vi.mock('dashboard/composables/store', () => ({
  useMapGetter: key =>
    ({
      'conversationStats/getStats': stats,
      getChatListFilters: listFilters,
      getCurrentUser: currentUser,
    })[key],
  useStore: () => ({
    dispatch,
    getters: { getConversationById: id => chats[id] },
  }),
}));

const list = ref([]);
const loadMore = vi.fn();

// status/assignee per id; default: open + unassigned
const setChats = spec => {
  Object.keys(chats).forEach(id => delete chats[id]);
  Object.entries(spec).forEach(([id, chat]) => {
    chats[id] = {
      id: Number(id),
      status: 'open',
      messages: [],
      meta: {},
      ...chat,
    };
  });
};

let api;
let wrapper;
const mountQueue = () => {
  wrapper = mount(
    defineComponent({
      setup() {
        api = usePlayQueue();
        return () => h('div');
      },
    })
  );
};

const prepare = ({ ids, total = ids.length, route, spec = {} }) => {
  resetPlay();
  push.mockClear();
  dispatch.mockClear();
  loadMore.mockReset();
  routeName.value = route || 'folder_conversations';
  setChats(Object.fromEntries(ids.map(id => [id, spec[id] || {}])));
  list.value = ids.map(id => ({ id }));
  stats.value = { allCount: total, mineCount: total, unAssignedCount: 0 };
  setPlayLiveList(list, { loadMore });
  mountQueue();
};

const assigned = id => ({ meta: { assignee: { id } } });
const claimCalls = () =>
  dispatch.mock.calls.filter(([action]) => action === 'assignAgent');

describe('usePlayQueue — navigation', () => {
  afterEach(() => wrapper?.unmount());

  it('Play opens the first ticket of the view', async () => {
    prepare({ ids: [11, 12, 13] });
    await api.play();

    expect(isPlaying.value).toBe(true);
    expect(push).toHaveBeenCalledWith('/folder/8/conversations/11');
  });

  it('does nothing on an empty view', async () => {
    prepare({ ids: [] });
    await api.play();

    expect(isPlaying.value).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('Next opens the first unplayed ticket in the live order', async () => {
    prepare({ ids: [11, 12, 13] });
    await api.play();
    await api.next(11);

    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });

  it('skips tickets that left the view and serves new ones in order', async () => {
    prepare({ ids: [11, 12, 13] });
    await api.play();
    setChats({ 99: {}, 11: assigned(ME), 13: {} });
    list.value = [{ id: 99 }, { id: 11 }, { id: 13 }];
    await api.next(11);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/99');

    await api.next(99);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/13');
  });

  it('counts what is left in the whole view, not just the loaded page', async () => {
    prepare({ ids: [11, 12, 13], total: 91, route: 'home' });
    await api.play();

    expect(api.remainingCount(11)).toBe(90);
  });

  it('loads the next page when the loaded tickets are played', async () => {
    prepare({ ids: [11], total: 3 });
    loadMore.mockImplementation(() => {
      setChats({ 11: assigned(ME), 12: {}, 13: {} });
      list.value = [{ id: 11 }, { id: 12 }, { id: 13 }];
    });
    await api.play();
    await api.next(11);
    await flushPromises();

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });

  it('returns to the view when the whole view has been played', async () => {
    prepare({ ids: [11] });
    await api.play();
    await api.next(11);

    expect(isPlaying.value).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/folder/8');
  });
});

describe('usePlayQueue — claiming (several agents on one view)', () => {
  afterEach(() => wrapper?.unmount());

  it('claims an open, unassigned ticket for the agent', async () => {
    prepare({ ids: [11, 12] });
    await api.play();

    expect(dispatch).toHaveBeenCalledWith('getConversation', 11);
    expect(dispatch).toHaveBeenCalledWith('assignAgent', {
      conversationId: 11,
      agentId: ME,
    });
  });

  it('skips a ticket that belongs to someone else, without taking it', async () => {
    prepare({ ids: [11, 12], spec: { 11: assigned(99) } });
    await api.play();

    expect(push).toHaveBeenCalledWith('/folder/8/conversations/12');
    expect(push).not.toHaveBeenCalledWith('/folder/8/conversations/11');
    expect(claimCalls().map(([, args]) => args.conversationId)).toEqual([12]);
  });

  it("does not overwrite a colleague's claim this screen has not seen yet", async () => {
    prepare({ ids: [11, 12] });
    dispatch.mockImplementation((action, id) => {
      if (action === 'getConversation' && id === 11) {
        chats[11].meta = { assignee: { id: 99 } }; // server says: taken
      }
    });
    await api.play();
    dispatch.mockImplementation(() => {});

    expect(push).not.toHaveBeenCalledWith('/folder/8/conversations/11');
    expect(push).toHaveBeenCalledWith('/folder/8/conversations/12');
    expect(claimCalls().map(([, args]) => args.conversationId)).toEqual([12]);
  });

  it('opens pending (bot) and own tickets without claiming', async () => {
    prepare({
      ids: [11, 12],
      spec: { 11: { status: 'pending' }, 12: assigned(ME) },
    });
    await api.play();
    await api.next(11);

    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
    expect(claimCalls()).toHaveLength(0);
  });

  it('gives back a claimed ticket the agent skipped untouched', async () => {
    prepare({ ids: [11, 12] });
    await api.play();
    chats[11].meta = { assignee: { id: ME } }; // claim landed
    await api.next(11);

    expect(dispatch).toHaveBeenCalledWith('assignAgent', {
      conversationId: 11,
      agentId: null,
    });
  });

  it('keeps a claimed ticket the agent replied to', async () => {
    prepare({ ids: [11, 12] });
    await api.play();
    chats[11].meta = { assignee: { id: ME } };
    chats[11].messages = [
      {
        message_type: 1,
        sender: { id: ME },
        created_at: Math.floor(Date.now() / 1000),
      },
    ];
    await api.next(11);

    expect(dispatch).not.toHaveBeenCalledWith('assignAgent', {
      conversationId: 11,
      agentId: null,
    });
  });

  it('keeps a claimed ticket that was resolved or passed on', async () => {
    prepare({ ids: [11, 12, 13] });
    await api.play();
    chats[11].meta = { assignee: { id: ME } };
    chats[11].status = 'resolved';
    await api.next(11);
    chats[12].meta = { assignee: { id: 42 } };
    await api.next(12);

    const releases = dispatch.mock.calls.filter(
      ([action, args]) => action === 'assignAgent' && args.agentId === null
    );
    expect(releases).toHaveLength(0);
  });

  it('Stop and Back give back an untouched claimed ticket', async () => {
    prepare({ ids: [11, 12] });
    await api.play();
    chats[11].meta = { assignee: { id: ME } };
    api.stop();
    await flushPromises();
    expect(dispatch).toHaveBeenCalledWith('assignAgent', {
      conversationId: 11,
      agentId: null,
    });
    expect(push).toHaveBeenLastCalledWith('/folder/8');

    chats[11].meta = {}; // the release landed: unassigned again
    await api.play();
    chats[11].meta = { assignee: { id: ME } };
    dispatch.mockClear();
    api.leave();
    await flushPromises();
    expect(dispatch).toHaveBeenCalledWith('assignAgent', {
      conversationId: 11,
      agentId: null,
    });
    expect(isPlaying.value).toBe(false);
  });
});

describe('helpers', () => {
  beforeEach(() => resetPlay());

  it('remainingIn falls back to the loaded rows when the total is unknown', () => {
    expect(remainingIn(11, undefined, [11, 12, 13])).toBe(2);
  });

  it('nextPlayableId ignores the current ticket', () => {
    expect(nextPlayableId(11, [11, 12])).toBe(12);
    expect(nextPlayableId(12, [12])).toBeNull();
  });

  it('wroteSince counts replies and notes by the agent after the claim', () => {
    const now = 1000;
    const chat = {
      messages: [
        { message_type: 0, sender: { id: ME }, created_at: now + 10 },
        { message_type: 1, sender: { id: 5 }, created_at: now + 10 },
        { message_type: 1, sender_id: ME, created_at: now - 100 },
      ],
    };
    expect(wroteSince(chat, ME, now)).toBe(false);
    chat.messages.push({
      message_type: 1,
      sender: { id: ME },
      created_at: now,
    });
    expect(wroteSince(chat, ME, now)).toBe(true);
  });
});

describe('FmPlayControls', () => {
  afterEach(() => resetPlay());

  it('renders nothing unless Play is running', () => {
    resetPlay();
    const controls = mount(FmPlayControls, { props: { conversationId: 11 } });

    expect(controls.find('[data-test-id="play-controls"]').exists()).toBe(
      false
    );
  });

  it('shows what is left and moves on with Next', async () => {
    prepare({ ids: [11, 12, 13] });
    await api.play();
    wrapper.unmount();
    wrapper = null;
    const controls = mount(FmPlayControls, { props: { conversationId: 11 } });
    await nextTick();

    expect(controls.find('[data-test-id="play-remaining"]').text()).toBe(
      'FLIGHTSMOJO.PLAY.REMAINING'
    );
    await controls.find('[data-test-id="play-next"]').trigger('click');
    await flushPromises();
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });
});
