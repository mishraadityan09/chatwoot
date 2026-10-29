// FlightsMojo: the tab bar's overflow handling — mouse wheel, end arrows and
// keeping the active tab in view. jsdom has no layout, so sizes are stubbed.
import { nextTick, reactive } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import FmTicketTabs from '../FmTicketTabs.vue';
import { openTab, resetTicketTabs } from '../useTicketTabs';

const route = reactive({
  name: 'folder_conversations',
  params: {},
  fullPath: '/l',
});
const push = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push }),
}));
const chats = reactive({});
vi.mock('dashboard/composables/store', () => ({
  useStore: () => ({
    dispatch: vi.fn(),
    getters: {
      getCurrentAccountId: 2,
      getCurrentUser: { id: 3 },
      getConversationById: id => chats[id],
    },
  }),
}));

// A bar with three tabs whose scroller pretends to be 200 px wide holding 600 px
// of tabs; scrollLeft is backed by a plain number so the handlers can move it.
const mountOverflowingBar = async ({ width = 200, content = 600 } = {}) => {
  openTab(1, '/t/1');
  openTab(2, '/t/2');
  openTab(3, '/t/3');
  const bar = mount(FmTicketTabs);
  const scroller = bar.find('[role="tablist"]');
  let left = 0;
  Object.defineProperties(scroller.element, {
    clientWidth: { configurable: true, get: () => width },
    scrollWidth: { configurable: true, get: () => content },
    scrollLeft: {
      configurable: true,
      get: () => left,
      set: value => {
        left = Math.max(0, Math.min(value, content - width));
      },
    },
    scrollBy: { configurable: true, value: undefined }, // force the fallback path
  });
  await scroller.trigger('scroll'); // re-measure with the stubbed sizes
  return { bar, scroller };
};

beforeEach(() => {
  resetTicketTabs();
  window.localStorage.clear();
  Object.keys(chats).forEach(id => delete chats[id]);
  route.params = {};
  route.name = 'folder_conversations';
  route.fullPath = '/l';
});

describe('FmTicketTabs overflow', () => {
  it('shows the end arrows only while the tabs overflow', async () => {
    const { bar, scroller } = await mountOverflowingBar();
    expect(bar.find('[data-test-id="ticket-tabs-scroll-left"]').exists()).toBe(
      true
    );
    expect(bar.find('[data-test-id="ticket-tabs-scroll-right"]').exists()).toBe(
      true
    );

    Object.defineProperty(scroller.element, 'scrollWidth', {
      configurable: true,
      get: () => 200,
    });
    await scroller.trigger('scroll');
    expect(bar.find('[data-test-id="ticket-tabs-scroll-left"]').exists()).toBe(
      false
    );
    expect(bar.find('[data-test-id="ticket-tabs-scroll-right"]').exists()).toBe(
      false
    );
  });

  it('turns a mouse wheel into sideways scrolling', async () => {
    const { scroller } = await mountOverflowingBar();

    await scroller.trigger('wheel', { deltaY: 40, deltaX: 0 });
    expect(scroller.element.scrollLeft).toBe(40);
    await scroller.trigger('wheel', { deltaY: -15, deltaX: 0 });
    expect(scroller.element.scrollLeft).toBe(25);
  });

  it('leaves trackpad sideways gestures to the browser', async () => {
    const { scroller } = await mountOverflowingBar();

    await scroller.trigger('wheel', { deltaY: 5, deltaX: 30 });
    expect(scroller.element.scrollLeft).toBe(0);
  });

  it('ignores the wheel when nothing overflows', async () => {
    const { scroller } = await mountOverflowingBar({
      width: 600,
      content: 600,
    });

    await scroller.trigger('wheel', { deltaY: 40, deltaX: 0 });
    expect(scroller.element.scrollLeft).toBe(0);
  });

  it('arrows move the bar by a page and disable at the ends', async () => {
    const { bar, scroller } = await mountOverflowingBar();
    const left = () => bar.find('[data-test-id="ticket-tabs-scroll-left"]');
    const right = () => bar.find('[data-test-id="ticket-tabs-scroll-right"]');

    expect(left().attributes('disabled')).toBeDefined();
    await right().trigger('click'); // 60 % of 200 px, at least 120
    await scroller.trigger('scroll');
    expect(scroller.element.scrollLeft).toBe(120);
    expect(left().attributes('disabled')).toBeUndefined();

    await right().trigger('click');
    await right().trigger('click');
    await right().trigger('click');
    await scroller.trigger('scroll');
    expect(scroller.element.scrollLeft).toBe(400); // clamped to the end
    expect(right().attributes('disabled')).toBeDefined();
  });

  it('reveals the active tab when the page loads straight onto a ticket', async () => {
    openTab(1, '/t/1');
    openTab(2, '/t/2');
    openTab(3, '/t/3');
    route.name = 'conversations_through_folders';
    route.params = { conversation_id: '3' };
    route.fullPath = '/t/3';
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      mount(FmTicketTabs);
      await nextTick();
      await nextTick();
    } finally {
      Element.prototype.scrollIntoView = original;
    }

    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: 'nearest',
      block: 'nearest',
    });
  });

  it('reveals the active tab again once the tab names arrive', async () => {
    openTab(1, '/t/1');
    openTab(2, '/t/2');
    route.name = 'conversations_through_folders';
    route.params = { conversation_id: '2' };
    route.fullPath = '/t/2';
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    let settled;
    let afterNames;
    try {
      mount(FmTicketTabs);
      await flushPromises();
      await flushPromises();
      scrollIntoView.mockClear();
      await flushPromises(); // nothing changed: no further reveal
      settled = scrollIntoView.mock.calls.length;
      chats[1] = { id: 1, meta: { sender: { name: 'A much longer name' } } };
      await flushPromises();
      await flushPromises();
      afterNames = scrollIntoView.mock.calls.length;
    } finally {
      Element.prototype.scrollIntoView = original;
    }

    expect(settled).toBe(0);
    expect(afterNames).toBeGreaterThanOrEqual(1);
  });

  it('brings the active tab into view when it changes', async () => {
    const { bar } = await mountOverflowingBar();
    const scrollIntoView = vi.fn();
    bar.findAll('[role="tab"]').forEach(tab => {
      tab.element.scrollIntoView = scrollIntoView;
    });

    route.name = 'conversations_through_folders';
    route.params = { conversation_id: '2' };
    route.fullPath = '/t/2';
    await nextTick();
    await nextTick();

    expect(scrollIntoView).toHaveBeenCalledWith({
      inline: 'nearest',
      block: 'nearest',
    });
    const selected = bar
      .findAll('[data-test-id="ticket-tab"]')
      .map(tab => tab.attributes('aria-selected'));
    expect(selected).toEqual(['false', 'true', 'false']); // the second tab, #2
  });
});
