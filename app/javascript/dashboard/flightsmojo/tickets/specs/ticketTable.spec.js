import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import {
  getTicketGroups,
  priorityKey,
  resetDefaultTicketLayoutCheck,
  useDefaultTicketLayout,
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

  it('switches an agent who never chose a layout to the table', () => {
    mountHook();

    expect(updateUISettings).toHaveBeenCalledWith({
      conversation_display_type: 'expanded',
      previously_used_conversation_display_type: 'expanded',
    });
  });

  it('keeps a layout the agent chose', () => {
    uiSettings.value = {
      conversation_display_type: 'condensed',
      previously_used_conversation_display_type: 'condensed',
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
