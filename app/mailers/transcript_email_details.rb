# FlightsMojo (FM-38): the conversation transcript lists every email we sent the way the
# customer received it: the real sender address, To, Cc, subject, and whether our mail server
# accepted it (with the Message-ID) or the send failed. That makes a transcript usable as proof
# that a mail went out. The values come from the same mailer rules as the real send.
module TranscriptEmailDetails
  extend ActiveSupport::Concern

  # Our replies end with the earlier mail as a quoted block ("> On ... wrote:"). That mail is
  # already part of the transcript, so the block is left out; anything else stays as written.
  QUOTED_HISTORY_START = /^> On .+ wrote:[ \t\r]*$/

  included do
    helper_method :transcript_sent_email, :transcript_message_content
  end

  private

  def transcript_sent_email(message)
    with_transcript_message(message) do
      cc_emails, bcc_emails = cc_bcc_emails
      {
        from: email_from,
        to: Array(to_emails).compact_blank,
        cc: Array(cc_emails).compact_blank,
        bcc: transcript_for_staff? ? Array(bcc_emails).compact_blank : [],
        subject: transcript_subject(message),
        delivery: transcript_delivery(message)
      }
    end
  end

  def transcript_message_content(message)
    content = message.content.to_s
    return content unless message.outgoing?

    start = trailing_quote_start(content)
    return content unless start

    content[0...start].rstrip.presence || content
  end

  # Where a quoted block that runs to the end of the text begins; nil when there is none or
  # when the text is nothing but the quote.
  def trailing_quote_start(content)
    start = content =~ QUOTED_HISTORY_START
    return if start.nil? || start.zero?

    start if content[start..].lines.all? { |line| line.start_with?('>') || line.strip.empty? }
  end

  # The subject the mailer used: the message's own, else the conversation's, with "Re:" when
  # other messages came before this one (counted up to this message, not up to today).
  def transcript_subject(message)
    stored = message.content_attributes&.dig('email', 'subject').presence
    return stored if stored

    subject = @conversation.additional_attributes['mail_subject']
    return "[##{@conversation.display_id}] #{I18n.t('conversations.reply.email_subject')}" if subject.nil?

    message.id > first_chat_message_id ? "Re: #{subject}" : subject
  end

  def first_chat_message_id
    @first_chat_message_id ||= @conversation.messages.chat.minimum(:id) || 0
  end

  def transcript_delivery(message)
    if message.failed?
      I18n.t('conversations.transcript_details.failed', error: message.external_error.presence || '-')
    elsif message.source_id.present?
      I18n.t('conversations.transcript_details.accepted', message_id: message.source_id)
    end
  end

  # Blind copies are internal: they show only when the transcript goes to someone who works
  # in this account, never to a customer or any outside address.
  def transcript_for_staff?
    recipient = @transcript_recipient.to_s.strip
    recipient.present? && @account.users.from_email(recipient).present?
  end

  # The mailer's own helpers read @message; point them at one message, then restore it.
  def with_transcript_message(message)
    previous = @message
    @message = message
    yield
  ensure
    @message = previous
  end
end
