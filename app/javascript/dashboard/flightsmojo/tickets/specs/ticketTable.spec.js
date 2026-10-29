/* eslint-disable vue/one-component-per-file -- tiny test harness components */
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { inject } from 'vue';
import {
  TICKET_HEADER_HEIGHT_KEY,
  getTicketGroups,
  priorityKey,
  resetDefaultTicketLayoutCheck,
  useDefaultTicketLayout,
  useTicketTable,
} from '../ticketTable';

const uiSettings = ref({});
const currentUser = ref({ id: 1 });
const updateUISettings = vi.fn();

vi.mock('dashboard/composables/useUISettings', () => ({
  useUISettings: () => ({ uiSettings, updateUISettings }),
}));
vi.mock('dashboard/composables/store', () => ({
  useMapGetter: () => currentUser,
}));

const rows = priorities => priorities.map((priority, id) => ({ id, priority }));

describe('priorityKey', () => {
  it('maps Chatwoot priorities and treats anything else as none', () => {
    expect(priorityKey('urgent')).toBe('URGENT');
    expect(priorityKey('low')).toBe('LOW');
    expect(priorityKey(null)).toBe('NONE');
    expect(priorityKey('bogus')).toBe('NONE');
  });
});

describe('getTicketGroups', () => {
  it('groups a priority-sorted list with counts', () => {
    const groups = getTicketGroups(
      rows(['urgent', 'urgent', 'high', 'medium', null, null])
    );

    expect([...groups.entries()]).toEqual([
      [0, { key: 'URGENT', count: 2 }],
      [2, { key: 'HIGH', count: 1 }],
      [3, { key: 'MEDIUM', count: 1 }],
      [4, { key: 'NONE', count: 2 }],
    ]);
  });

  it('returns no groups when the list is not in priority order', () => {
    expect(getTicketGroups(rows(['low', 'urgent', 'high'])).size).toBe(0);
  });

  it('handles empty and missing lists', () => {
    expect(getTicketGroups([]).size).toBe(0);
    expect(getTicketGroups(undefined).size).toBe(0);
  });
});

describe('useDefaultTicketLayout', () => {
  // Unmounted after each test: a live watcher from an earlier test would
  // otherwise run (flushed by the next mount) after the flag is reset.
  let wrappers = [];
  const mountHook = () => {
    const wrapper = mount(
      defineComponent({
        setup() {
          useDefaultTicketLayout();
          return () => h('div');
        },
      })
    );
    wrappers.push(wrapper);
    return wrapper;
  };

  afterEach(() => {
    wrappers.forEach(wrapper => wrapper.unmount());
    wrappers = [];
  });

  beforeEach(() => {
    resetDefaultTicketLayoutCheck();
    updateUISettings.mockClear();
    uiSettings.value = {};
    currentUser.value = { id: 1 };
  });

  it('gives a new agent the table, sorted by priority then oldest', () => {
    mountHook();

    expect(updateUISettings).toHaveBeenCalledWith({
      flightsmojo_defaults_version: 1,
      conversation_display_type: 'expanded',
      previously_used_conversation_display_type: 'expanded',
      conversations_filter_by: { order_by: 'priority_desc_created_at_asc' },
    });
  });

  it('keeps a layout and sort the agent chose, recording that it checked', () => {
    uiSettings.value = {
      conversation_display_type: 'condensed',
      previously_used_conversation_display_type: 'condensed',
      conversations_filter_by: { status: 'open', order_by: 'created_at_asc' },
    };
    mountHook();

    expect(updateUISettings).toHaveBeenCalledWith({
      flightsmojo_defaults_version: 1,
    });
  });

  it("replaces Chatwoot's default sort, keeping the status filter", () => {
    uiSettings.value = {
      previously_used_conversation_display_type: 'condensed',
      conversations_filter_by: {
        status: 'pending',
        order_by: 'last_activity_at_desc',
      },
    };
    mountHook();

    expect(updateUISettings).toHaveBeenCalledWith({
      flightsmojo_defaults_version: 1,
      conversations_filter_by: {
        status: 'pending',
        order_by: 'priority_desc_created_at_asc',
      },
    });
  });

  it('never runs again once an agent has had the defaults', () => {
    uiSettings.value = {
      flightsmojo_defaults_version: 1,
      conversations_filter_by: { order_by: 'last_activity_at_desc' },
    };
    mountHook();

    expect(updateUISettings).not.toHaveBeenCalled();
  });

  it('waits for the current user before deciding', async () => {
    currentUser.value = {};
    mountHook();
    expect(updateUISettings).not.toHaveBeenCalled();

    currentUser.value = { id: 1 };
    await nextTick();
    expect(updateUISettings).toHaveBeenCalledTimes(1);
  });

  it('checks only once per page load', () => {
    mountHook();
    mountHook();

    expect(updateUISettings).toHaveBeenCalledTimes(1);
  });
});

describe('useTicketTable', () => {
  it('shares one header height between the header and the list', () => {
    let fromList;
    let fromHeader;
    const Header = defineComponent({
      setup() {
        fromHeader = inject(TICKET_HEADER_HEIGHT_KEY);
        return () => h('div');
      },
    });
    const wrapper = mount(
      defineComponent({
        setup() {
          fromList = useTicketTable(() => []).headerHeight;
          return () => h(Header);
        },
      })
    );

    fromHeader.value = 62;
    expect(fromList.value).toBe(62);
    wrapper.unmount();
  });
});
