import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import ConversationApi from 'dashboard/api/inbox/conversation';
import { emitter } from 'shared/helpers/mitt';
import { BUS_EVENTS } from 'shared/constants/busEvents';
import {
  COUNT_ONLY_PAGE,
  FETCH_THROTTLE_MS,
  fetchNow,
  getFolderCount,
  resetFolderCounts,
  settleWithLimit,
  useFolderCounts,
} from '../useFolderCounts';

vi.mock('dashboard/api/inbox/conversation', () => ({
  default: { filter: vi.fn() },
}));

const folder = (id, updatedAt = 't1') => ({
  id,
  name: `Folder ${id}`,
  query: { payload: [{ attribute_key: 'status', values: [String(id)] }] },
  updated_at: updatedAt,
});
const countsById = { 1: 40, 2: 137, 3: 0 };
const respond = () =>
  ConversationApi.filter.mockImplementation(({ queryData }) =>
    Promise.resolve({
      data: {
        meta: { all_count: countsById[queryData.payload[0].values[0]] },
      },
    })
  );

const setVisibility = state =>
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });

let wrapper;
const mountSidebar = folders => {
  const list = ref(folders);
  wrapper = mount(
    defineComponent({
      setup() {
        useFolderCounts(list);
        return () => h('div');
      },
    })
  );
  return list;
};

describe('useFolderCounts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFolderCounts();
    ConversationApi.filter.mockReset();
    respond();
    setVisibility('visible');
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  it('counts every folder with its own query, payload skipped', async () => {
    mountSidebar([folder(1), folder(2)]);
    await flushPromises();

    expect(ConversationApi.filter).toHaveBeenCalledWith({
      queryData: folder(1).query,
      page: COUNT_ONLY_PAGE,
    });
    expect(getFolderCount(1)).toBe(40);
    expect(getFolderCount(2)).toBe(137);
    expect(getFolderCount(99)).toBe(0);
  });

  it('refreshes on conversation events, at most once per throttle window', async () => {
    mountSidebar([folder(1)]);
    await flushPromises();
    expect(ConversationApi.filter).toHaveBeenCalledTimes(1);

    countsById[1] = 41;
    emitter.emit('fetch_conversation_stats');
    emitter.emit('fetch_conversation_stats');
    emitter.emit(BUS_EVENTS.WEBSOCKET_RECONNECT);
    await flushPromises();
    expect(ConversationApi.filter).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FETCH_THROTTLE_MS);
    await flushPromises();
    expect(ConversationApi.filter).toHaveBeenCalledTimes(2);
    expect(getFolderCount(1)).toBe(41);
    countsById[1] = 40;
  });

  it('re-counts when a folder is added or its filter edited', async () => {
    const list = mountSidebar([folder(1)]);
    await flushPromises();
    vi.advanceTimersByTime(FETCH_THROTTLE_MS);

    list.value = [folder(1, 't2'), folder(2)];
    await nextTick();
    await flushPromises();

    expect(ConversationApi.filter).toHaveBeenCalledTimes(3);
    expect(getFolderCount(2)).toBe(137);
  });

  it('keeps the last known count when a request fails', async () => {
    mountSidebar([folder(1)]);
    await flushPromises();

    ConversationApi.filter.mockRejectedValueOnce(new Error('boom'));
    vi.advanceTimersByTime(FETCH_THROTTLE_MS);
    await fetchNow();

    expect(getFolderCount(1)).toBe(40);
  });

  it('waits while the tab is hidden and catches up when it is shown', async () => {
    setVisibility('hidden');
    mountSidebar([folder(1)]);
    await flushPromises();
    expect(ConversationApi.filter).not.toHaveBeenCalled();

    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await flushPromises();
    expect(ConversationApi.filter).toHaveBeenCalledTimes(1);
  });

  it('stops listening when the sidebar unmounts', async () => {
    mountSidebar([folder(1)]);
    await flushPromises();
    wrapper.unmount();
    wrapper = null;
    vi.advanceTimersByTime(FETCH_THROTTLE_MS);

    emitter.emit('fetch_conversation_stats');
    await flushPromises();
    expect(ConversationApi.filter).toHaveBeenCalledTimes(1);
  });
});

describe('settleWithLimit', () => {
  it('never runs more than the limit at once and keeps result order', async () => {
    let running = 0;
    let peak = 0;
    const task = async value => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
      if (value === 3) throw new Error('nope');
      return value * 10;
    };

    const results = await settleWithLimit([1, 2, 3, 4, 5], 2, task);

    expect(peak).toBe(2);
    expect(results.map(r => r.status)).toEqual([
      'fulfilled',
      'fulfilled',
      'rejected',
      'fulfilled',
      'fulfilled',
    ]);
    expect(results[4].value).toBe(50);
  });
});
