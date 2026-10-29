# == Schema Information
#
# Table name: inbox_capacity_limits
#
#  id                       :bigint           not null, primary key
#  conversation_limit       :integer          not null
#  created_at               :datetime         not null
#  updated_at               :datetime         not null
#  agent_capacity_policy_id :bigint           not null
#  inbox_id                 :bigint           not null
#
# Indexes
#
#  idx_on_agent_capacity_policy_id_inbox_id_71c7ec4caf      (agent_capacity_policy_id,inbox_id) UNIQUE
#  index_inbox_capacity_limits_on_agent_capacity_policy_id  (agent_capacity_policy_id)
#  index_inbox_capacity_limits_on_inbox_id                  (inbox_id)
#
# FlightsMojo: the most open conversations one agent of a capacity policy may hold in one inbox.
class InboxCapacityLimit < ApplicationRecord
  belongs_to :agent_capacity_policy
  belongs_to :inbox

  validates :conversation_limit, presence: true, numericality: { greater_than_or_equal_to: 0, only_integer: true }
  validates :inbox_id, uniqueness: { scope: :agent_capacity_policy_id }
  validate :inbox_belongs_to_policy_account

  def api_json
    { id: id, inbox_id: inbox_id, conversation_limit: conversation_limit, agent_capacity_policy_id: agent_capacity_policy_id }
  end

  private

  def inbox_belongs_to_policy_account
    return if inbox.blank? || agent_capacity_policy.blank?

    errors.add(:inbox, 'must belong to the same account') if inbox.account_id != agent_capacity_policy.account_id
  end
end
