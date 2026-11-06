# FlightsMojo (FM-41): Settings → Email Routing — clean what the page sends, save it, and answer the
# page's "Try a mail" checker. Routing itself lives in EmailRoutes.
module EmailRoutes::Settings
  MAX_RULES = 20
  MAX_ENTRIES = 200

  module_function

  # Returns [rules, errors]; save only when errors is empty.
  def sanitize(account, input)
    errors = []
    known = EmailRoutes.email_inboxes(account).pluck(:id)
    rules = Array(input).first(MAX_RULES + 1).each_with_object([]) do |raw, list|
      rule = sanitize_rule(raw, known, list, errors)
      list << rule if rule
    end
    errors << "At most #{MAX_RULES} inboxes can be listed" if rules.size > MAX_RULES
    [rules, errors]
  end

  def sanitize_rule(raw, known, list, errors)
    rule = raw.respond_to?(:to_h) ? raw.to_h.stringify_keys : {}
    inbox_id = rule['inbox_id'].to_i
    error = rule_error(rule['inbox_id'], inbox_id, known, list)
    if error
      errors << error
      return nil
    end

    { 'inbox_id' => inbox_id, 'senders' => entries(rule['senders'], errors), 'recipients' => entries(rule['recipients'], errors) }
  end

  def rule_error(given, inbox_id, known, list)
    return "Inbox #{given.inspect} is not an email inbox of this account" unless known.include?(inbox_id)

    "Inbox #{inbox_id} is listed twice" if list.any? { |existing| existing['inbox_id'] == inbox_id }
  end

  def entries(values, errors)
    list = Array(values).map { |value| value.to_s.strip.downcase }.compact_blank.uniq.filter_map do |value|
      next value if value.match?(URI::MailTo::EMAIL_REGEXP) || value.match?(EmailRoutes::DOMAIN)

      errors << "\"#{value}\" is not an email address or an @domain"
      nil
    end
    errors << "At most #{MAX_ENTRIES} addresses per list" if list.size > MAX_ENTRIES
    list
  end

  def save!(account, rules, user:)
    account.with_lock do
      changed = { 'by' => user.name, 'user_id' => user.id, 'at' => Time.current.utc.iso8601 }
      account.settings = (account.settings || {}).merge(EmailRoutes::SETTING_KEY => rules, EmailRoutes::CHANGED_KEY => changed)
      account.save!
    end
    Rails.logger.info("[FM-41] email routes saved by user #{user.id}: #{rules.to_json}")
  end

  # Where would a new mail from `from` to `to` (To/Cc, comma-separated) go under `rules`? Nothing is saved.
  def check(account, rules:, from:, to:)
    mail = Mail.new(from: from.to_s, to: to.to_s)
    default = upstream_channel(mail, account)
    return { result: 'refused' } unless default

    found = EmailRoutes.match(mail, account, rules)
    return { result: 'default', inbox: inbox_json(default.inbox) } unless found

    { result: found.reason.to_s, entry: found.entry, inbox: inbox_json(found.channel.inbox) }
  rescue Mail::Field::ParseError, Mail::Field::IncompleteParseError, ArgumentError
    { result: 'invalid' }
  end

  # Upstream's choice for the checker: the first of our addresses in To/Cc.
  def upstream_channel(mail, account)
    channels = Channel::Email.where(account_id: account.id).to_a
    EmailRoutes.addresses_in(mail.to, mail.cc).map { |address| EmailRoutes.without_plus(address) }.each do |address|
      channel = channels.find { |candidate| EmailRoutes.own_addresses(candidate).include?(address) }
      return channel if channel
    end
    nil
  end

  def inbox_json(inbox)
    { id: inbox.id, name: inbox.name }
  end
end
