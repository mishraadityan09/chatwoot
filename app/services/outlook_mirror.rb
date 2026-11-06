# FlightsMojo (FM-40): keep a team's shared mailbox (Outlook) in step with an email inbox.
#
# The IROP inbox sends from agency@flightsmojo.in through Netcore, so its replies never pass
# through Microsoft 365 and the desk sees only half of each supplier chain in Outlook. With
# FM_OUTLOOK_MIRROR="18:agency@flightsmojo.in" (inbox id:address, several pairs separated by
# commas; off when unset; email inboxes only):
# - every mail the inbox sends has the address in Cc unless it is already a recipient, so the
#   mailbox gets a copy, and a supplier's "Reply all" reaches the ticket and the mailbox alike;
# - the Cc that went out is stored on the message (cc_emails), so the message view and the
#   transcript show it, and messages sent before the setting keep what they really had;
# - a mail from that address arriving on an existing ticket (someone answered in Outlook with
#   "Reply all", which keeps the ticket's reply+ address) becomes a private note instead of a
#   message from the contact, so it neither speaks for the supplier nor reopens the ticket.
module OutlookMirror
  ENV_KEY = 'FM_OUTLOOK_MIRROR'.freeze
  TICKET_REPLY_ADDRESS = /\Areply\+/i

  module_function

  # Mailer: adds the inbox's mirror address(es) to the Cc of an outgoing mail (in place).
  def add_cc!(options, inbox)
    present = addresses_in(options[:to], options[:cc], options[:bcc])
    missing = addresses_for(inbox).reject { |address| present.include?(address.downcase) }
    options[:cc] = Array(options[:cc]).compact_blank + missing if missing.any?
    options
  end

  # After a send: records on the message any Cc address that went out but is not stored yet.
  # Only assigns; the caller's save (the one that stores source_id) writes it.
  def remember_sent_cc(message, mail)
    stored = Array(message.content_attributes[:cc_emails]).compact_blank
    known = addresses_in(stored)
    missing = Array(mail.try(:cc)).compact_blank.reject { |address| known.include?(address.to_s.downcase) }
    return if missing.empty?

    message.content_attributes = message.content_attributes.merge(cc_emails: stored + missing)
  end

  # Mailbox: the attributes for a mail arriving on a conversation; a private note when it was
  # written in Outlook from the inbox's mirror address on a ticket that already exists.
  def message_attributes(attributes, conversation:, mail:)
    sender = outlook_sender(conversation, mail)
    return attributes unless sender

    attributes.merge(sender: nil, message_type: 'outgoing', private: true, content_type: 'text',
                     content: [note_header(sender, mail), attributes[:content]].compact_blank.join("\n\n"))
  end

  def outlook_sender(conversation, mail)
    mirror = addresses_for(conversation.inbox).map(&:downcase)
    sender = from_addresses(mail).find { |address| mirror.include?(address) }
    sender if sender && conversation.persisted? && conversation.messages.exists?
  end

  # The From header itself: MailPresenter#from prefers Reply-To, which says nothing about who wrote it.
  def from_addresses(mail)
    raw = mail.respond_to?(:mail) ? mail.mail : mail
    Array(raw.try(:from)).map { |address| address.to_s.downcase }
  end

  def note_header(sender, mail)
    to = Array(mail.try(:to)).grep_v(TICKET_REPLY_ADDRESS)
    cc = Array(mail.try(:cc)).grep_v(TICKET_REPLY_ADDRESS).reject { |address| address.to_s.casecmp?(sender) }
    ["Sent from Outlook by #{sender}", ("to #{to.join(', ')}" if to.any?), ("cc #{cc.join(', ')}" if cc.any?)].compact.join(' · ')
  end

  def addresses_for(inbox)
    return [] unless inbox&.email?

    pairs.filter_map { |inbox_id, address| address if inbox_id == inbox.id }
  end

  # "18:agency@flightsmojo.in, 12:care@flightsmojo.in" → [[18, "agency@flightsmojo.in"], [12, "care@flightsmojo.in"]]
  def pairs
    ENV.fetch(ENV_KEY, '').split(/[\s,;]+/).compact_blank.filter_map do |pair|
      inbox_id, address = pair.split(':', 2)
      next [inbox_id.to_i, address] if inbox_id.match?(/\A\d+\z/) && address.to_s.match?(URI::MailTo::EMAIL_REGEXP)

      Rails.logger.warn("[FM-40] #{ENV_KEY}: ignoring #{pair.inspect}, expected inbox_id:address")
      nil
    end
  end

  # Every address in header values, lower-case: ["Ann <A@x.com>, b@y.com"] → ["a@x.com", "b@y.com"].
  def addresses_in(*values)
    values.flatten.compact.flat_map { |value| value.to_s.split(',') }.filter_map { |item| address_of(item) }
  end

  def address_of(item)
    Mail::Address.new(item.strip).address&.downcase
  rescue Mail::Field::ParseError, Mail::Field::IncompleteParseError
    item.strip.downcase.presence
  end
end
