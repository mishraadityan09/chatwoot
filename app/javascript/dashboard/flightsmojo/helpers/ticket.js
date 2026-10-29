// FlightsMojo: ticket-level facts shared by the conversation card and the
// ticket table. Reads data the conversation payload already carries; no API.

const clean = value => (typeof value === 'string' ? value.trim() : '');

/**
 * The ticket's subject line, or '' when it has none.
 * Email conversations carry it in `additional_attributes.mail_subject` (set by
 * Chatwoot's mailbox); tickets created through the API inbox (support site)
 * put it in `additional_attributes.subject`.
 * @param {Object} chat - conversation as stored in the conversations store
 * @returns {string}
 */
export const getTicketSubject = chat => {
  const { mail_subject: mailSubject, subject } =
    chat?.additional_attributes || {};
  return clean(mailSubject) || clean(subject);
};

// The one rule for what counts as a booking id (the header chip, the card
// and the table all use it): the attribute is also writable from the website
// pre-chat form, so only a plain numeric booking id is shown.
const BOOKING_ID_PATTERN = /^\d{1,10}$/;

/**
 * The booking id stored on the conversation, or '' when it has none (or a
 * value that is not a plain numeric id).
 * @param {Object} chat - conversation as stored in the conversations store
 * @returns {string}
 */
export const getBookingId = chat => {
  const value = String(chat?.custom_attributes?.booking_id ?? '').trim();
  return BOOKING_ID_PATTERN.test(value) ? value : '';
};

/**
 * A duration as agents read it in a table cell: "45m", "3h 10m", "2d 4h".
 * Under a minute reads "<1m". Missing or negative input gives ''.
 * @param {number} seconds
 * @returns {string}
 */
export const formatShortDuration = seconds => {
  if (seconds === null || seconds === undefined || seconds === '') return '';
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) return '';
  if (total < 60) return '<1m';
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
};
