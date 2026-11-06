# FlightsMojo (FM-41): which email inbox a NEW mail goes to.
#
# Upstream gives the mail to the inbox of the first of our addresses in To/Cc. A complaint sent to
# care@ with legal@ in Cc therefore lands in the care inbox, and when both mailboxes forward it, it
# lands there twice. Administrators rank email inboxes in Settings → Email Routing; the ordered list
# is stored in account.settings['email_routes']:
#
#   [{ 'inbox_id' => 21, 'senders' => ['nch-ca@gov.in'], 'recipients' => ['grievance@flightsmojo.in', '@gov.in'] }, …]
#
# A listed inbox takes a new mail when
#   - its own address or its forwarding address is in To, Cc or X-Original-To,
#   - the From address matches one of its senders ("name@domain", or "@domain" for that domain and
#     its subdomains), or
#   - To or Cc matches one of its recipients (same forms).
# The first inbox in the list that matches wins. A mail that matches none keeps upstream's choice, and
# so do replies to an existing ticket (they are matched to their ticket before this runs). No rules = off.
# Saving and checking from the settings page: EmailRoutes::Settings.
module EmailRoutes
  SETTING_KEY = 'email_routes'.freeze
  CHANGED_KEY = 'email_routes_changed'.freeze
  DOMAIN = /\A@[a-z0-9-]+(\.[a-z0-9-]+)+\z/
  Rule = Struct.new(:channel, :senders, :recipients)
  Match = Struct.new(:channel, :reason, :entry)

  module_function

  def enabled?(account)
    stored(account).any?
  end

  # The channel for this mail, or nil to keep upstream's choice (`default`, the inbox it found).
  def channel_for(mail, default)
    return if default.nil?

    rules = stored(default.account)
    return if rules.empty?

    match(mail, default.account, rules)&.channel
  end

  # The first rule that takes the mail and why: reason :address (the inbox's own address), :sender or :recipient.
  def match(mail, account, rules)
    senders = addresses_in(mail.from)
    recipients = addresses_in(mail.to, mail.cc, original_to(mail)).map { |address| without_plus(address) }
    build(account, rules).each do |rule|
      reason, entry = first_hit(rule, senders, recipients)
      return Match.new(rule.channel, reason, entry) if reason
    end
    nil
  end

  def first_hit(rule, senders, recipients)
    own = own_addresses(rule.channel)
    hit = recipients.find { |address| own.include?(address) }
    return [:address, hit] if hit

    hit = matching(rule.senders, senders)
    return [:sender, hit] if hit

    hit = matching(rule.recipients, recipients)
    [:recipient, hit] if hit
  end

  def matching(patterns, addresses)
    patterns.find { |pattern| addresses.any? { |address| covers?(pattern, address) } }
  end

  def covers?(pattern, address)
    return address == pattern unless pattern.start_with?('@')

    address.end_with?(pattern) || address.end_with?(".#{pattern.delete_prefix('@')}")
  end

  def own_addresses(channel)
    [channel.email, channel.forward_to_email].compact_blank.map(&:downcase)
  end

  # The saved list, in priority order.
  def stored(account)
    Array(account&.settings&.dig(SETTING_KEY)).select { |rule| rule.is_a?(Hash) }
  end

  # Saved rules → Rule structs for the account's email inboxes that still exist.
  def build(account, rules)
    channels = email_inboxes(account).where(id: rules.pluck('inbox_id')).includes(:channel).index_by(&:id)
    rules.filter_map do |rule|
      channel = channels[rule['inbox_id'].to_i]&.channel
      Rule.new(channel, Array(rule['senders']), Array(rule['recipients'])) if channel
    end
  end

  def email_inboxes(account)
    account.inboxes.where(channel_type: 'Channel::Email')
  end

  def original_to(mail)
    header = mail['X-Original-To']
    header.is_a?(Array) ? header.map { |field| field.try(:value) } : header.try(:value)
  end

  # Same rule as upstream's EmailChannelFinder: "care+x@flightsmojo.in" is care@flightsmojo.in.
  def without_plus(address)
    local, domain = address.split('@', 2)
    domain ? "#{local.split('+').first}@#{domain}" : address
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
