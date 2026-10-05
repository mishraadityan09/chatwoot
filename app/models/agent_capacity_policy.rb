# == Schema Information
#
# Table name: agent_capacity_policies
#
#  id              :bigint           not null, primary key
#  description     :text
#  exclusion_rules :jsonb            not null
#  name            :string(255)      not null
#  created_at      :datetime         not null
#  updated_at      :datetime         not null
#  account_id      :bigint           not null
#
# Indexes
#
#  index_agent_capacity_policies_on_account_id  (account_id)
#
# FlightsMojo: how many open conversations an agent may hold per inbox. An administrator
# creates a policy in Settings → Agent Assignment → Agent capacity, sets a limit per inbox
# and adds agents; auto-assignment (assignment v2) stops giving a conversation to an agent
# who is at the limit of that inbox. exclusion_rules name conversations that do not count
# towards the limit: { 'excluded_labels' => [...], 'exclude_older_than_hours' => n }.
class AgentCapacityPolicy < ApplicationRecord
  MAX_NAME_LENGTH = 255

  belongs_to :account
  has_many :inbox_capacity_limits, dependent: :destroy
  has_many :inboxes, through: :inbox_capacity_limits
  has_many :account_users, dependent: :nullify

  validates :name, presence: true, length: { maximum: MAX_NAME_LENGTH }
  validate :exclusion_rules_shape

  before_validation :normalise_exclusion_rules

  def excluded_labels
    Array(exclusion_rules['excluded_labels'])
  end

  def exclude_older_than_hours
    exclusion_rules['exclude_older_than_hours']
  end

  # The JSON the Agent capacity screens read.
  def api_json
    {
      id: id,
      name: name,
      description: description,
      exclusion_rules: { excluded_labels: excluded_labels, exclude_older_than_hours: exclude_older_than_hours },
      assigned_agent_count: account_users.count,
      inbox_capacity_limits: inbox_capacity_limits.order(:id).map(&:api_json)
    }
  end

  private

  def normalise_exclusion_rules
    rules = exclusion_rules.is_a?(Hash) ? exclusion_rules.stringify_keys : {}
    labels = Array(rules['excluded_labels']).map { |label| label.to_s.strip }.compact_blank.uniq
    hours = rules['exclude_older_than_hours']
    hours = hours.to_i if hours.present? && hours.to_s.match?(/\A\d+\z/)
    self.exclusion_rules = { 'excluded_labels' => labels, 'exclude_older_than_hours' => hours.presence }.compact
  end

  def exclusion_rules_shape
    hours = exclusion_rules['exclude_older_than_hours']
    return if hours.nil? || (hours.is_a?(Integer) && hours.positive?)

    errors.add(:exclusion_rules, 'exclude_older_than_hours must be a positive whole number')
  end
end
