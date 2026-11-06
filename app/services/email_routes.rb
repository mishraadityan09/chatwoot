# FlightsMojo (FM-41): which email inbox a NEW mail goes to.
#
# Upstream gives the mail to the inbox of the first of our addresses in To/Cc. A complaint sent to
# care@ with legal@ in Cc therefore lands in the care inbox, and when both mailboxes forward it, it
# lands there twice. This setting ranks inboxes and lets chosen senders go to a chosen inbox:
#
#   FM_EMAIL_ROUTES="21:nch-ca@gov.in 19:fraud.alerts@razorpay.com,chargebacks@razorpay.com 20:@wego.com"
#
# Left to right is the priority. An Email inbox in the list takes a new mail when
#   - its own address or its forwarding address is in To, Cc or X-Original-To,
#   - the From address is one of its entries ("name@domain", or "@domain" for that domain and its
#     subdomains), or
#   - To or Cc holds one of its "to:" entries ("to:grievance@flightsmojo.in", "to:@gov.in").
# The first inbox that matches wins. A mail that matches none keeps upstream's choice, and so do
# replies to an existing ticket (they are matched to their ticket before this runs). Unset = off.
module EmailRoutes
  ENV_KEY = 'FM_EMAIL_ROUTES'.freeze
  DOMAIN = /\A@[a-z0-9-]+(\.[a-z0-9-]+)+\z/
  RULE_START = /\A(\d+)(?::(.*))?\z/m
  Rule = Struct.new(:channel, :senders, :recipients)

  module_function

  def enabled?
    ENV.fetch(ENV_KEY, '').strip.present?
  end

  # The channel for this mail, or nil to keep upstream's choice (`default`, the inbox it found).
  def channel_for(mail, default)
    return if default.nil? || !enabled?

    senders = addresses_in(mail.from)
    recipients = addresses_in(mail.to, mail.cc, original_to(mail)).map { |address| without_plus(address) }
    rules(default.account_id).find { |rule| match?(rule, senders, recipients) }&.channel
  end

  def match?(rule, senders, recipients)
    rule.senders.any? { |pattern| senders.any? { |address| covers?(pattern, address) } } ||
      rule.recipients.any? { |pattern| recipients.any? { |address| covers?(pattern, address) } }
  end

  def covers?(pattern, address)
    return address == pattern unless pattern.start_with?('@')

    address.end_with?(pattern) || address.end_with?(".#{pattern.delete_prefix('@')}")
  end

  # The configured Email inboxes of this account, in priority order, with their own addresses added.
  def rules(account_id)
    parsed = parse
    inboxes = Inbox.where(id: parsed.map(&:first), account_id: account_id, channel_type: 'Channel::Email').includes(:channel).index_by(&:id)
    parsed.filter_map do |inbox_id, senders, recipients|
      channel = inboxes[inbox_id]&.channel
      next unless channel

      own = [channel.email, channel.forward_to_email].compact_blank.map(&:downcase)
      Rule.new(channel, senders, own + recipients)
    end
  end

  # "21:a@x.com, @y.com to:b@z.in 19" → [[21, ["a@x.com", "@y.com"], ["b@z.in"]], [19, [], []]]
  # Spaces, commas and semicolons may all separate entries; a number starts the next inbox.
  def parse
    ENV.fetch(ENV_KEY, '').split(/[\s;]+/).compact_blank.each_with_object([]) do |token, list|
      if (start = token.match(RULE_START))
        inbox_id = start[1].to_i
        list << [inbox_id, [], []] unless list.any? { |rule| rule.first == inbox_id }
        current = list.find { |rule| rule.first == inbox_id }
        token = start[2].to_s
      else
        current = list.last
      end
      token.split(',').compact_blank.each { |entry| add_entry(current, entry) }
    end
  end

  def add_entry(rule, entry)
    recipient = entry.downcase.start_with?('to:')
    value = (recipient ? entry[3..] : entry).to_s.strip.downcase
    if rule && (value.match?(URI::MailTo::EMAIL_REGEXP) || value.match?(DOMAIN))
      (recipient ? rule.third : rule.second) << value
    else
      Rails.logger.warn("[FM-41] #{ENV_KEY}: ignoring #{entry.inspect}, expected inbox_id:address,@domain,to:address")
    end
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
