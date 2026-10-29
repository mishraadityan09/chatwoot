// FlightsMojo (FM-33 / FM-34): the ticket table's columns. One registry drives
// the header, every row and the grid template. Which columns show, and in
// which order, is each agent's choice, saved in their UI settings
// (flightsmojo_ticket_columns) like the sidebar width, so it follows them
// across browsers. `sort` names the server-side sort family understood by
// Conversations::SortService (`<sort>_asc` / `<sort>_desc`); columns without
// one cannot be sorted truthfully across pages, so their header is plain.
import { computed, inject, provide } from 'vue';
import { useUISettings } from 'dashboard/composables/useUISettings';

export const TICKET_COLUMNS_SETTING = 'flightsmojo_ticket_columns';
export const TICKET_COLUMNS_KEY = Symbol('fmTicketColumns');

const column = (key, labelKey, width, extra = {}) => ({
  key,
  labelKey,
  width,
  ...extra,
});

// Registry order = order of the hidden columns in the "Columns" menu.
// width: a fixed track ('5.5rem') or a share of the spare room ('3fr');
// minWidth (px): what the column never shrinks below — when the chosen
// columns' minimums exceed the list, the list scrolls sideways instead of
// squeezing them (the default nine fit a 1280 px screen). align: 'end' for
// numbers and times.
export const TICKET_COLUMNS = Object.freeze({
  status: column('status', 'STATUS', '5.5rem', {
    minWidth: 88,
    sort: 'status',
    defaultDirection: 'asc',
  }),
  subject: column('subject', 'SUBJECT', '3fr', {
    minWidth: 160,
    required: true,
  }),
  requester: column('requester', 'REQUESTER', '1.3fr', {
    minWidth: 100,
    sort: 'requester',
    defaultDirection: 'asc',
  }),
  requested: column('requested', 'REQUESTED', '6.5rem', {
    minWidth: 104,
    sort: 'created_at',
    defaultDirection: 'desc',
  }),
  priority: column('priority', 'PRIORITY', '5.5rem', {
    minWidth: 88,
    sort: 'priority',
    defaultDirection: 'desc',
  }),
  group: column('group', 'GROUP', '1fr', {
    minWidth: 90,
    sort: 'team',
    defaultDirection: 'asc',
  }),
  assignee: column('assignee', 'ASSIGNEE', '1fr', {
    minWidth: 100,
    sort: 'assignee',
    defaultDirection: 'asc',
  }),
  channel: column('channel', 'CHANNEL', '1fr', {
    minWidth: 100,
    sort: 'inbox',
    defaultDirection: 'asc',
  }),
  updated: column('updated', 'UPDATED', '3.5rem', {
    minWidth: 56,
    align: 'end',
    sort: 'last_activity_at',
    defaultDirection: 'desc',
  }),
  id: column('id', 'ID', '4.5rem', {
    minWidth: 72,
    sort: 'created_at',
    defaultDirection: 'desc',
  }),
  booking_id: column('booking_id', 'BOOKING_ID', '6.5rem', { minWidth: 104 }),
  labels: column('labels', 'LABELS', '1.2fr', { minWidth: 150 }),
  email: column('email', 'EMAIL', '1.4fr', { minWidth: 170 }),
  first_response: column('first_response', 'FIRST_RESPONSE', '6rem', {
    minWidth: 96,
    align: 'end',
  }),
  waiting_since: column('waiting_since', 'WAITING_SINCE', '6rem', {
    minWidth: 96,
    align: 'end',
    sort: 'waiting_since',
    defaultDirection: 'asc',
  }),
});

export const DEFAULT_TICKET_COLUMNS = Object.freeze([
  'status',
  'subject',
  'requester',
  'requested',
  'priority',
  'group',
  'assignee',
  'channel',
  'updated',
]);

const LEADING_TRACK = '1.25rem'; // the checkbox
const TRAILING_TRACK = '1.75rem'; // the row menu
// Same numbers in px, plus FmTicketGrid's gap-3 and px-3, for the width sum.
const FIXED_TRACKS_PX = 20 + 28;
const GAP_PX = 12;
const PADDING_PX = 24;

/**
 * Saved keys → a valid, ordered list: unknown keys dropped, duplicates
 * removed, Subject always present. Nothing saved means the defaults.
 * @param {Array|undefined|null} keys
 * @returns {string[]}
 */
export const normalizeColumnKeys = keys => {
  const list = Array.isArray(keys)
    ? keys.filter(key => TICKET_COLUMNS[key])
    : [];
  const unique = [...new Set(list)];
  if (unique.length === 0) return [...DEFAULT_TICKET_COLUMNS];
  if (!unique.includes('subject')) {
    unique.splice(Math.min(1, unique.length), 0, 'subject');
  }
  return unique;
};

// A flexible column is `minmax(min, share)`; a fixed one is its width.
const trackFor = ({ width, minWidth }) =>
  width.endsWith('fr') ? `minmax(${minWidth}px,${width})` : width;

export const gridTemplateFor = keys =>
  [
    LEADING_TRACK,
    ...keys.map(key => trackFor(TICKET_COLUMNS[key])),
    TRAILING_TRACK,
  ].join(' ');

/** The width below which the table scrolls sideways instead of shrinking. */
export const tableMinWidthFor = keys =>
  FIXED_TRACKS_PX +
  keys.reduce((sum, key) => sum + TICKET_COLUMNS[key].minWidth, 0) +
  GAP_PX * (keys.length + 1) +
  PADDING_PX;

export const gridStyleFor = keys => ({
  '--fm-ticket-columns': gridTemplateFor(keys),
  '--fm-ticket-min-width': `${tableMinWidthFor(keys)}px`,
});

// Our combined default sort (priority, then oldest first) counts as
// "priority, highest first" in the header.
const COMBINED_SORTS = Object.freeze({
  priority_desc_created_at_asc: { sort: 'priority', direction: 'desc' },
});

/**
 * Which column family the active sort belongs to, and its direction.
 * @param {string} sortBy - e.g. 'created_at_desc'
 * @returns {{sort: string, direction: 'asc'|'desc'}|null}
 */
export const activeSortFor = sortBy => {
  if (typeof sortBy !== 'string' || !sortBy) return null;
  if (COMBINED_SORTS[sortBy]) return COMBINED_SORTS[sortBy];
  const match = /^(.+)_(asc|desc)$/.exec(sortBy);
  return match ? { sort: match[1], direction: match[2] } : null;
};

/**
 * The sort key a click on this column's header applies: its default
 * direction, or the opposite direction when it is already the active sort.
 * @returns {string|null} null for columns that cannot be sorted
 */
export const sortKeyFor = (col, active) => {
  if (!col?.sort) return null;
  let direction = col.defaultDirection || 'asc';
  if (active?.sort === col.sort) {
    direction = active.direction === 'asc' ? 'desc' : 'asc';
  }
  return `${col.sort}_${direction}`;
};

/** The agent's column choice, read from and written to their UI settings. */
export const useTicketColumns = () => {
  const { uiSettings, updateUISettings } = useUISettings();
  const keys = computed(() =>
    normalizeColumnKeys(uiSettings.value?.[TICKET_COLUMNS_SETTING])
  );
  const columns = computed(() => keys.value.map(key => TICKET_COLUMNS[key]));
  const hiddenColumns = computed(() =>
    Object.values(TICKET_COLUMNS).filter(col => !keys.value.includes(col.key))
  );
  const gridStyle = computed(() => gridStyleFor(keys.value));
  const isDefault = computed(
    () => keys.value.join() === DEFAULT_TICKET_COLUMNS.join()
  );

  const save = next =>
    updateUISettings({ [TICKET_COLUMNS_SETTING]: normalizeColumnKeys(next) });
  // Hidden → shown appends at the end; the agent drags it where they want it.
  const toggleColumn = key => {
    if (!TICKET_COLUMNS[key] || TICKET_COLUMNS[key].required) return;
    save(
      keys.value.includes(key)
        ? keys.value.filter(item => item !== key)
        : [...keys.value, key]
    );
  };
  const reorder = next => save(next);
  // null, not a copy of the defaults: a later change of the defaults should
  // reach agents who never chose.
  const reset = () => updateUISettings({ [TICKET_COLUMNS_SETTING]: null });

  return {
    keys,
    columns,
    hiddenColumns,
    gridStyle,
    isDefault,
    toggleColumn,
    reorder,
    reset,
  };
};

// ConversationList provides the agent's columns once (useTicketTable); rows,
// the header and the grid read them from there. Without a provider (specs,
// stories) the defaults apply.
export const provideTicketColumns = context =>
  provide(TICKET_COLUMNS_KEY, context);

const DEFAULT_CONTEXT = Object.freeze({
  keys: computed(() => [...DEFAULT_TICKET_COLUMNS]),
  columns: computed(() =>
    DEFAULT_TICKET_COLUMNS.map(key => TICKET_COLUMNS[key])
  ),
  gridStyle: computed(() => gridStyleFor(DEFAULT_TICKET_COLUMNS)),
});

export const useTicketColumnsContext = () =>
  inject(TICKET_COLUMNS_KEY, DEFAULT_CONTEXT);
