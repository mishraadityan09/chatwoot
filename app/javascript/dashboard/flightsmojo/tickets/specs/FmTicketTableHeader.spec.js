import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';
import FmTicketTableHeader from '../FmTicketTableHeader.vue';
import {
  TICKET_COLUMNS,
  TICKET_COLUMNS_KEY,
  gridStyleFor,
} from '../ticketColumns';

const stats = ref({ allCount: 138, updatedOn: new Date() });
const sortFilter = ref('');
const statusFilter = ref('open');
const dispatch = vi.fn();
const updateUISettings = vi.fn();

// The factories run while the module loads, so the test refs are only read
// inside the functions, once the component asks for them.
vi.mock('dashboard/composables/store', async () => {
  const { ref: makeRef } = await import('vue');
  return {
    useMapGetter: key =>
      ({
        'conversationStats/getStats': stats,
        getChatSortFilter: sortFilter,
        getChatStatusFilter: statusFilter,
      })[key] ?? makeRef(null),
    useStore: () => ({ dispatch, getters: {} }),
  };
});
vi.mock('dashboard/composables/useUISettings', async () => {
  const { ref: makeRef } = await import('vue');
  return {
    useUISettings: () => ({ uiSettings: makeRef({}), updateUISettings }),
  };
});

const byTestId = (wrapper, id) => wrapper.find(`[data-test-id="${id}"]`);

const columnsContext = keys => ({
  keys: computed(() => keys),
  columns: computed(() => keys.map(key => TICKET_COLUMNS[key])),
  gridStyle: computed(() => gridStyleFor(keys)),
});

const mountHeader = ({ props = {}, keys = null } = {}) =>
  mount(FmTicketTableHeader, {
    props,
    global: {
      provide: keys ? { [TICKET_COLUMNS_KEY]: columnsContext(keys) } : {},
      stubs: { Icon: true },
    },
  });

describe('FmTicketTableHeader', () => {
  beforeEach(() => {
    stats.value = { allCount: 138, updatedOn: new Date() };
    sortFilter.value = '';
    statusFilter.value = 'open';
    dispatch.mockClear();
    updateUISettings.mockClear();
  });

  it('shows loaded of total tickets in a folder view', () => {
    const wrapper = mountHeader({ props: { loadedCount: 25, foldersId: 8 } });

    expect(byTestId(wrapper, 'ticket-summary').text()).toBe(
      'FLIGHTSMOJO.TICKETS.SUMMARY.FOLDER'
    );
  });

  it('shows the loaded count outside folder views', () => {
    const wrapper = mountHeader({ props: { loadedCount: 11 } });

    expect(byTestId(wrapper, 'ticket-summary').text()).toBe(
      'FLIGHTSMOJO.TICKETS.SUMMARY.LOADED'
    );
  });

  it('says updated just now for a fresh list', () => {
    const wrapper = mountHeader({ props: { loadedCount: 1 } });

    expect(byTestId(wrapper, 'ticket-updated').text()).toBe(
      'FLIGHTSMOJO.TICKETS.UPDATED_JUST_NOW'
    );
  });

  it('shows how long ago the list was updated', () => {
    stats.value = {
      allCount: 3,
      updatedOn: new Date(Date.now() - 5 * 60 * 1000),
    };
    const wrapper = mountHeader({ props: { loadedCount: 1 } });

    expect(byTestId(wrapper, 'ticket-updated').text()).toBe(
      'FLIGHTSMOJO.TICKETS.UPDATED_AGO'
    );
  });

  it('renders the default column titles when nothing is provided', () => {
    const text = mountHeader().text();

    [
      'STATUS',
      'SUBJECT',
      'REQUESTER',
      'REQUESTED',
      'PRIORITY',
      'GROUP',
      'ASSIGNEE',
      'CHANNEL',
      'UPDATED',
    ].forEach(column =>
      expect(text).toContain(`FLIGHTSMOJO.TICKETS.COLUMNS.${column}`)
    );
  });

  it('renders the provided columns, in order, and only those', () => {
    const wrapper = mountHeader({ keys: ['subject', 'id', 'updated'] });
    const text = wrapper.text();

    expect(text).toContain('FLIGHTSMOJO.TICKETS.COLUMNS.ID');
    expect(text).not.toContain('FLIGHTSMOJO.TICKETS.COLUMNS.STATUS');
    expect(text.indexOf('COLUMNS.SUBJECT')).toBeLessThan(
      text.indexOf('COLUMNS.ID')
    );
    expect(text.indexOf('COLUMNS.ID')).toBeLessThan(
      text.indexOf('COLUMNS.UPDATED')
    );
  });

  it('sorts by a column on click, the way the sort menu does', async () => {
    const wrapper = mountHeader();

    await byTestId(wrapper, 'ticket-column-requested').trigger('click');

    expect(wrapper.emitted('sort')).toEqual([['created_at_desc']]);
    expect(dispatch).toHaveBeenCalledWith(
      'setChatSortFilter',
      'created_at_desc'
    );
    expect(updateUISettings).toHaveBeenCalledWith({
      conversations_filter_by: { status: 'open', order_by: 'created_at_desc' },
    });
  });

  it('flips the direction when the column is already the sort', async () => {
    sortFilter.value = 'created_at_desc';
    const wrapper = mountHeader();

    await byTestId(wrapper, 'ticket-column-requested').trigger('click');

    expect(wrapper.emitted('sort')).toEqual([['created_at_asc']]);
  });

  it('marks the active column with its direction', () => {
    sortFilter.value = 'assignee_asc';
    const wrapper = mountHeader();
    const assignee = byTestId(wrapper, 'ticket-column-assignee');

    expect(assignee.attributes('aria-sort')).toBe('ascending');
    expect(assignee.find('[data-test-id="ticket-sort-icon"]').exists()).toBe(
      true
    );
    expect(
      byTestId(wrapper, 'ticket-column-requester').attributes('aria-sort')
    ).toBeUndefined();
  });

  it('reads the combined default sort as priority, highest first', async () => {
    sortFilter.value = 'priority_desc_created_at_asc';
    const wrapper = mountHeader();
    const priority = byTestId(wrapper, 'ticket-column-priority');

    expect(priority.attributes('aria-sort')).toBe('descending');

    await priority.trigger('click');

    expect(wrapper.emitted('sort')).toEqual([['priority_asc']]);
  });

  it('leaves the subject unsortable', () => {
    const subject = byTestId(mountHeader(), 'ticket-column-subject');

    expect(subject.element.tagName).toBe('SPAN');
    expect(subject.attributes('aria-sort')).toBeUndefined();
  });
});
