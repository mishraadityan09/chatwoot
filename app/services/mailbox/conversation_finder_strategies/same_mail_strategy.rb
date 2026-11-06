# FlightsMojo (FM-41): one mail, one ticket. When a new mail names two of our mailboxes (care@ and
# legal@, say) and both forward it, it reaches us twice with the same Message-ID. While the account
# has email routes (Settings → Email Routing), both copies pick the same inbox, and the second copy
# finds the ticket the first one opened; MailboxHelper#create_message then skips it because that
# Message-ID is already stored there. A stored mail only counts as the same mail when its subject and
# sender match too: a broken sender that reuses one Message-ID for different mails keeps every mail.
class Mailbox::ConversationFinderStrategies::SameMailStrategy < Mailbox::ConversationFinderStrategies::BaseStrategy
  def find
    message_id = sanitize_mailbox_value(mail.message_id)
    return nil if message_id.blank?

    channel = EmailChannelFinder.new(mail).perform
    return nil unless channel && EmailRoutes.enabled?(channel.account)

    Message.where(inbox_id: channel.inbox.id, source_id: message_id).order(:id).find { |message| copy_of?(message) }&.conversation
  end

  private

  def copy_of?(message)
    stored = (message.content_attributes&.dig(:email) || {}).to_h.with_indifferent_access
    stored[:subject].to_s.strip == mail.subject.to_s.strip && senders(stored[:from]) == senders(mail.from)
  end

  def senders(value)
    Array(value).map { |address| address.to_s.strip.downcase }.sort
  end
end
