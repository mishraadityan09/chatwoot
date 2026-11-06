class Email::SendOnEmailService < Base::SendOnChannelService
  private

  def channel_class
    Channel::Email
  end

  def perform_reply
    return unless message.email_notifiable_message?

    reply_mail = ConversationReplyMailer.with(account: message.account).email_reply(message).deliver_now
    Rails.logger.info("Email message #{message.id} sent with source_id: #{reply_mail.message_id}")
    store_sent_details(reply_mail)
  rescue StandardError => e
    ChatwootExceptionTracker.new(e, account: message.account).capture_exception
    Messages::StatusUpdateService.new(message, 'failed', e.message).perform
  end

  def store_sent_details(reply_mail)
    OutlookMirror.remember_sent_cc(message, reply_mail) # FlightsMojo (FM-40): keep the Cc that really went out
    message.update(source_id: reply_mail.message_id)
  end
end
