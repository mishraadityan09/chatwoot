# FlightsMojo (FM-41): one mail, one ticket. When a new mail names two of our mailboxes (care@ and
# legal@, say) and both forward it, it reaches us twice with the same Message-ID. With FM_EMAIL_ROUTES
# set, both copies pick the same inbox, and the second copy finds the ticket the first one opened;
# MailboxHelper#create_message then skips it because that Message-ID is already stored there.
class Mailbox::ConversationFinderStrategies::SameMailStrategy < Mailbox::ConversationFinderStrategies::BaseStrategy
  def find
    return nil unless EmailRoutes.enabled?

    message_id = sanitize_mailbox_value(mail.message_id)
    return nil if message_id.blank?

    channel = EmailChannelFinder.new(mail).perform
    return nil unless channel

    Message.where(inbox_id: channel.inbox.id, source_id: message_id).order(:id).first&.conversation
  end
end
