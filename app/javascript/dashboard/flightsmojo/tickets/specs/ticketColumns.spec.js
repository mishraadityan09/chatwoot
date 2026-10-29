import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_TICKET_COLUMNS,
  TICKET_COLUMNS,
  TICKET_COLUMNS_SETTING,
  activeSortFor,
  gridTemplateFor,
  normalizeColumnKeys,
  provideTicketColumns,
  sortKeyFor,
  tableMinWidthFor,
  useTicketColumns,
  useTicketColumnsContext,
} from '../ticketColumns';

const uiSettings = ref({});
const updateUISettings = vi.fn();

vi.mock('dashboard/composables/useUISettings', () => ({
  useUISettings: () => ({ uiSettings, updateUISettings }),
}));

describe('normalizeColumnKeys', () => {
  it('falls back to the defaults when nothing is saved', () => {
    expect(normalizeColumnKeys(undefined)).toEqual([...DEFAULT_TICKET_COLUMNS]);
    expect(normalizeColumnKeys(null)).toEqual([...DEFAULT_TICKET_COLUMNS]);
    expect(normalizeColumnKeys([])).toEqual([...DEFAULT_TICKET_COLUMNS]);
  });

  it('drops unknown and duplicate keys and keeps the order', () => {
    expect(
      normalizeColumnKeys(['updated', 'nope', 'subject', 'updated', 'id'])
    ).toEqual(['updated', 'subject', 'id']);
  });

  it('always keeps the subject, as the second column', () => {
    expect(normalizeColumnKeys(['status', 'assignee'])).toEqual([
      'status',
      'subject',
      'assignee',
    ]);
    expect(normalizeColumnKeys(['assignee'])).toEqual(['assignee', 'subject']);
  });
});

describe('gridTemplateFor', () => {
  it('wraps the chosen tracks between the checkbox and the row menu', () => {
    expect(gridTemplateFor(['status', 'subject'])).toBe(
      '1.25rem 5.5rem minmax(160px,3fr) 1.75rem'
    );
  });
});

describe('tableMinWidthFor', () => {
  it('adds the fixed tracks, the minimums, the gaps and the padding', () => {
    // 20 + 28 fixed, 88 + 160 minimums, 3 gaps of 12, 24 padding
    expect(tableMinWidthFor(['status', 'subject'])).toBe(356);
  });

  it('keeps the default columns inside a 1280 px screen', () => {
    expect(tableMinWidthFor([...DEFAULT_TICKET_COLUMNS])).toBeLessThanOrEqual(
      1080
    );
  });
});

describe('activeSortFor', () => {
  it('splits a sort key into its family and direction', () => {
    expect(activeSortFor('created_at_desc')).toEqual({
      sort: 'created_at',
      direction: 'desc',
    });
    expect(activeSortFor('last_activity_at_asc')).toEqual({
      sort: 'last_activity_at',
      direction: 'asc',
    });
  });

  it('reads the combined default sort as priority, highest first', () => {
    expect(activeSortFor('priority_desc_created_at_asc')).toEqual({
      sort: 'priority',
      direction: 'desc',
    });
  });

  it('gives null for unread, empty and odd values', () => {
    expect(activeSortFor('unread')).toBeNull();
    expect(activeSortFor('')).toBeNull();
    expect(activeSortFor(undefined)).toBeNull();
    expect(activeSortFor({})).toBeNull();
  });
});

describe('sortKeyFor', () => {
  it('applies the column default direction first, then flips it', () => {
    const { requested } = TICKET_COLUMNS;

    expect(sortKeyFor(requested, null)).toBe('created_at_desc');
    expect(
      sortKeyFor(requested, { sort: 'created_at', direction: 'desc' })
    ).toBe('created_at_asc');
    expect(
      sortKeyFor(requested, { sort: 'created_at', direction: 'asc' })
    ).toBe('created_at_desc');
    expect(sortKeyFor(requested, { sort: 'priority', direction: 'desc' })).toBe(
      'created_at_desc'
    );
  });

  it('has nothing for columns the server cannot sort by', () => {
    expect(sortKeyFor(TICKET_COLUMNS.subject, null)).toBeNull();
    expect(sortKeyFor(TICKET_COLUMNS.labels, null)).toBeNull();
  });
});

describe('useTicketColumns', () => {
  beforeEach(() => {
    uiSettings.value = {};
    updateUISettings.mockClear();
  });

  it('reads the saved choice and reports whether it is the default', () => {
    const { keys, isDefault } = useTicketColumns();

    expect(keys.value).toEqual([...DEFAULT_TICKET_COLUMNS]);
    expect(isDefault.value).toBe(true);

    uiSettings.value = { [TICKET_COLUMNS_SETTING]: ['subject', 'id'] };

    expect(keys.value).toEqual(['subject', 'id']);
    expect(isDefault.value).toBe(false);
  });

  it('lists the hidden columns in registry order', () => {
    uiSettings.value = { [TICKET_COLUMNS_SETTING]: ['subject', 'updated'] };
    const { hiddenColumns } = useTicketColumns();

    expect(hiddenColumns.value.map(column => column.key)).toEqual(
      Object.keys(TICKET_COLUMNS).filter(
        key => !['subject', 'updated'].includes(key)
      )
    );
  });

  it('toggles a column on (appended) and off, never the subject', () => {
    const { toggleColumn } = useTicketColumns();

    toggleColumn('id');
    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: [...DEFAULT_TICKET_COLUMNS, 'id'],
    });

    toggleColumn('channel');
    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: DEFAULT_TICKET_COLUMNS.filter(
        key => key !== 'channel'
      ),
    });

    updateUISettings.mockClear();
    toggleColumn('subject');
    toggleColumn('nope');
    expect(updateUISettings).not.toHaveBeenCalled();
  });

  it('saves a reorder and resets by clearing the setting', () => {
    const { reorder, reset } = useTicketColumns();

    reorder(['subject', 'status', 'bogus']);
    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: ['subject', 'status'],
    });

    reset();
    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: null,
    });
  });

  it('exposes a grid style for the chosen columns', () => {
    uiSettings.value = { [TICKET_COLUMNS_SETTING]: ['subject', 'updated'] };
    const { gridStyle } = useTicketColumns();

    expect(gridStyle.value).toEqual({
      '--fm-ticket-columns': '1.25rem minmax(160px,3fr) 3.5rem 1.75rem',
      '--fm-ticket-min-width': '324px',
    });
  });
});

describe('useTicketColumnsContext', () => {
  const Child = defineComponent({
    setup() {
      const context = useTicketColumnsContext();
      return () => h('span', context.keys.value.join(','));
    },
  });

  it('uses the defaults when nothing is provided', () => {
    expect(mount(Child).text()).toBe(DEFAULT_TICKET_COLUMNS.join(','));
  });

  it('uses what a parent provides', () => {
    const Parent = defineComponent({
      setup() {
        provideTicketColumns({
          keys: ref(['subject']),
          columns: ref([TICKET_COLUMNS.subject]),
          gridStyle: ref({}),
        });
        return () => h(Child);
      },
    });

    expect(mount(Parent).text()).toBe('subject');
  });
});
