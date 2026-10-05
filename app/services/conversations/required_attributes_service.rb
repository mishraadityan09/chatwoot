# FlightsMojo: conversation attributes an agent has to fill in before resolving
# a conversation (for example the booking id). An administrator picks them in
# Settings → Conversation Workflow; the choice is stored in
# account.settings['conversation_required_attributes'] and the dashboard asks for the
# missing ones when someone clicks Resolve. This service is the server-side copy of
# that check, so an API client cannot skip it either.
class Conversations::RequiredAttributesService
  SETTING_KEY = 'conversation_required_attributes'.freeze
  FEATURE = 'conversation_required_attributes'.freeze

  def initialize(account)
    @account = account
  end

  def enabled?
    @account.feature_enabled?(FEATURE)
  end

  # The configured keys that are still defined as conversation attributes.
  def required_keys
    return [] unless enabled?

    Array(@account.settings[SETTING_KEY]).map(&:to_s) & definitions.keys
  end

  # What may be saved from the settings page: existing conversation attribute keys only,
  # so a typo or a deleted attribute can never block resolving.
  def sanitize(keys)
    Array(keys).map(&:to_s).uniq & definitions.keys
  end

  # Keys the conversation has no (valid) value for yet.
  def missing_keys(conversation)
    values = conversation.custom_attributes || {}
    required_keys.reject { |key| filled?(definitions[key], values[key]) }
  end

  # Names an agent recognises ("Booking ID"), for messages.
  def display_names(keys)
    keys.map { |key| definitions[key]&.attribute_display_name.presence || key }
  end

  private

  def definitions
    @definitions ||= @account.custom_attribute_definitions
                             .conversation_attribute
                             .index_by(&:attribute_key)
  end

  # Same rules as the dashboard (useConversationRequiredAttributes): a checkbox is filled once
  # true or false was chosen, anything else needs text; a value that breaks the attribute's
  # regular expression (set in Settings → Custom Attributes) counts as not filled.
  def filled?(definition, value)
    return !value.nil? if definition.checkbox?
    return false if value.nil? || value.to_s.strip.empty?

    matches_pattern?(definition, value.to_s)
  end

  def matches_pattern?(definition, value)
    return true if definition.regex_pattern.blank?

    regexp_for(definition.regex_pattern).match?(value)
  rescue RegexpError # includes Regexp::TimeoutError: a broken pattern never blocks resolving
    true
  end

  # The settings page stores the pattern the way JavaScript prints it: /source/flags.
  def regexp_for(pattern)
    match = pattern.match(%r{\A/(.+)/([a-z]*)\z}m)
    return Regexp.new(pattern) unless match

    options = 0
    options |= Regexp::IGNORECASE if match[2].include?('i')
    options |= Regexp::MULTILINE if match[2].include?('s') # JS dotAll
    Regexp.new(match[1], options)
  end
end
