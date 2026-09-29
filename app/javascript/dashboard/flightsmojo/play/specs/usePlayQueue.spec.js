/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import FmPlayControls from '../FmPlayControls.vue';
import {
  endPlay,
  isPlaying,
  nextPlayableId,
  resetPlay,
  setPlayLiveList,
  usePlayQueue,
} from '../usePlayQueue';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
vi.mock('dashboard/composables/useConversationRoutePath', () => ({
  useConversationRoutePath: () => ({
    buildConversationPath: id => `/folder/8/conversations/${id}`,
    buildConversationListPath: () => '/folder/8',
  }),
}));

const list = ref([]);
const rows = ids => ids.map(id => ({ id }));

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

describe('usePlayQueue', () => {
  beforeEach(() => {
    resetPlay();
    push.mockClear();
    list.value = rows([11, 12, 13]);
    setPlayLiveList(list);
    mountQueue();
  });

  afterEach(() => wrapper.unmount());

  it('Play opens the first ticket of the view', () => {
    api.play();

    expect(isPlaying.value).toBe(true);
    expect(push).toHaveBeenCalledWith('/folder/8/conversations/11');
  });

  it('does nothing on an empty view', () => {
    list.value = [];
    api.play();

    expect(isPlaying.value).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('Next opens the first unplayed ticket in the live order', () => {
    api.play();
    api.next(11);

    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
  });

  it('skips tickets that left the view and serves new ones in order', () => {
    api.play();
    // 12 was resolved (left the view); a new urgent 99 arrived at the top.
    list.value = rows([99, 11, 13]);
    api.next(11);

    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/99');
    api.next(99);
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/13');
  });

  it('returns to the view and stops when nothing is left', () => {
    list.value = rows([11]);
    api.play();
    api.next(11);

    expect(isPlaying.value).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/folder/8');
  });

  it('Stop goes back to the view', () => {
    api.play();
    api.stop();

    expect(isPlaying.value).toBe(false);
    expect(push).toHaveBeenLastCalledWith('/folder/8');
  });

  it('counts what is left, excluding the current ticket', () => {
    api.play();

    expect(api.remainingCount(11)).toBe(2);
    api.next(11);
    expect(api.remainingCount(12)).toBe(1);
  });

  it('nextPlayableId ignores the current ticket', () => {
    expect(nextPlayableId(11, [11, 12])).toBe(12);
    expect(nextPlayableId(12, [12])).toBeNull();
  });
});

describe('FmPlayControls', () => {
  beforeEach(() => {
    resetPlay();
    push.mockClear();
    list.value = rows([11, 12, 13]);
    setPlayLiveList(list);
  });

  const mountControls = () =>
    mount(FmPlayControls, { props: { conversationId: 11 } });

  it('renders nothing unless Play is running', () => {
    expect(
      mountControls().find('[data-test-id="play-controls"]').exists()
    ).toBe(false);
  });

  it('shows what is left and moves on with Next', async () => {
    mountQueue();
    api.play();
    wrapper.unmount();
    const controls = mountControls();

    expect(controls.find('[data-test-id="play-remaining"]').text()).toBe(
      'FLIGHTSMOJO.PLAY.REMAINING'
    );
    await controls.find('[data-test-id="play-next"]').trigger('click');
    expect(push).toHaveBeenLastCalledWith('/folder/8/conversations/12');
    endPlay();
  });
});
