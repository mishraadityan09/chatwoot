// FlightsMojo: ticket-level facts shared by the conversation card and the
// ticket table. Reads data the conversation payload already carries; no API.

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
  const value = mailSubject || subject;
  return typeof value === 'string' ? value.trim() : '';
};
