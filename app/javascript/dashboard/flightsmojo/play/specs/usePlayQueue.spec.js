/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FmPlayControls from '../FmPlayControls.vue';
import {
  endPlay,
  isPlaying,
  nextPlayableId,
  remainingIn,
  resetPlay,
  setPlayLiveList,
  usePlayQueue,
} from '../usePlayQueue';

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
vi.mock('dashboard/composables/store', () => ({
  useMapGetter: key =>
    key === 'conversationStats/getStats' ? stats : listFilters,
}));

const list = ref([]);
const rows = ids => ids.map(id => ({ id }));
const loadMore = vi.fn();

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

const prepare = ({ ids, total, route = 'folder_conversations' }) => {
  resetPlay();
  push.mockClear();
  loadMore.mockReset();
  routeName.value = route;
  list.value = rows(ids);
  stats.value = { allCount: total, mineCount: total, unAssignedCount: 0 };
  setPlayLiveList(list, { loadMore });
  mountQueue();
};

describe('usePlayQueue', () => {
  afterEach(() => wrapper?.unmount());

  it('Play opens the first ticket of the view', () => {
    prepare({ ids: [11, 12, 13], total: 3 });
    api.play();

    expect(isPlaying.value).toBe(true);
    expect(push).toHaveBeenCalledWith('/folder/8/conversations/11');
  });

  it('does nothing on an empty view', () => {
    prepare({ ids: [], total: 0 });
    api.play();

    expect(isPlaying.value).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('Next opens the first unplayed ticket in the live order', async () => {
    prepare({ ids: [11, 12, 13], total: 3 });
    api.play();
    await api.next(11);

    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });

  it('skips tickets that left the view and serves new ones in order', async () => {
    prepare({ ids: [11, 12, 13], total: 3 });
    api.play();
    list.value = rows([99, 11, 13]); // 12 resolved, urgent 99 arrived
    await api.next(11);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/99');

    await api.next(99);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/13');
  });

  it('counts what is left in the whole view, not just the loaded page', () => {
    prepare({ ids: [11, 12, 13], total: 91, route: 'home' });
    api.play();

    expect(api.remainingCount(11)).toBe(90);
  });

  it('uses the active tab count outside folders', () => {
    prepare({ ids: [11, 12], total: 50, route: 'home' });
    stats.value = { allCount: 161, mineCount: 91, unAssignedCount: 17 };
    listFilters.value = { assigneeType: 'unassigned' };
    api.play();

    expect(api.remainingCount(11)).toBe(16);
    listFilters.value = { assigneeType: 'me' };
  });

  it('loads the next page when the loaded tickets are played', async () => {
    prepare({ ids: [11], total: 3 });
    loadMore.mockImplementation(() => {
      list.value = rows([11, 12, 13]);
    });
    api.play();

    await api.next(11);
    await flushPromises();

    expect(loadMore).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });

  it('returns to the view when the whole view has been played', async () => {
    prepare({ ids: [11], total: 1 });
    api.play();
    await api.next(11);

    expect(loadMore).not.toHaveBeenCalled();
    expect(isPlaying.value).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/folder/8');
  });

  it('Stop goes back to the view', () => {
    prepare({ ids: [11, 12], total: 2 });
    api.play();
    api.stop();

    expect(isPlaying.value).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/folder/8');
  });
});

describe('remainingIn / nextPlayableId', () => {
  beforeEach(() => resetPlay());

  it('falls back to the loaded rows when the total is unknown', () => {
    expect(remainingIn(11, undefined, [11, 12, 13])).toBe(2);
  });

  it('ignores the current ticket', () => {
    expect(nextPlayableId(11, [11, 12])).toBe(12);
    expect(nextPlayableId(12, [12])).toBeNull();
  });
});

describe('FmPlayControls', () => {
  afterEach(() => endPlay());

  it('renders nothing unless Play is running', () => {
    resetPlay();
    const controls = mount(FmPlayControls, { props: { conversationId: 11 } });

    expect(controls.find('[data-test-id="play-controls"]').exists()).toBe(
      false
    );
  });

  it('shows what is left and moves on with Next', async () => {
    prepare({ ids: [11, 12, 13], total: 3 });
    api.play();
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
