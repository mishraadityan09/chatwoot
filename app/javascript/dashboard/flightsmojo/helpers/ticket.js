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

// Same shape the conversation header chip accepts (ConversationHeader.vue):
// the attribute is also writable from the website pre-chat form, so only a
// plain numeric booking id is shown.
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
