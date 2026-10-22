// FlightsMojo: the one status colour language of the workspace. The ticket
// tabs, the table's Status column and the compact conversation card all draw
// the same dot, so an agent reads one system everywhere. Tailwind scans this
// file (tailwind.config.js lists dashboard/flightsmojo/**/*.js), so the class
// names may live here.
export const STATUS_DOT_CLASS = Object.freeze({
  open: 'bg-n-ruby-9',
  pending: 'bg-n-amber-9',
  snoozed: 'bg-n-slate-9',
  resolved: 'bg-n-teal-9',
});

export const STATUS_LABEL_KEY = Object.freeze({
  open: 'FLIGHTSMOJO.TICKETS.STATUS.OPEN',
  pending: 'FLIGHTSMOJO.TICKETS.STATUS.PENDING',
  snoozed: 'FLIGHTSMOJO.TICKETS.STATUS.SNOOZED',
  resolved: 'FLIGHTSMOJO.TICKETS.STATUS.RESOLVED',
});

/** Dot colour for a conversation status; a quiet grey for anything unknown. */
export const statusDotClass = status =>
  STATUS_DOT_CLASS[status] || 'bg-n-slate-7';

/** Translation key for a status, or null when it is not one of the four. */
export const statusLabelKey = status => STATUS_LABEL_KEY[status] || null;
