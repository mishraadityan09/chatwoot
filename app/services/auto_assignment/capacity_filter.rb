# FlightsMojo: applies agent capacity policies to assignment v2. An agent whose policy sets
# a limit for this inbox gets no new conversation from it once they hold that many open
# ones. As the policy screen says, conversations with an excluded label, or older than the
# set duration, do not count towards the limit. With no policy for the inbox nothing changes.
class AutoAssignment::CapacityFilter
  pattr_initialize [:inbox!]

  # inbox_members: the agents that passed the other filters. Returns the ones with room left.
  # Counts are taken fresh on every call: the service filters once per conversation, and an
  # agent who has just received one must count it before the next is handed out.
  def filter(inbox_members)
    members = inbox_members.to_a
    return members if rules.empty?

    counts = Hash.new { |cache, policy_id| cache[policy_id] = open_counts(policy_id) }
    members.select do |member|
      rule = rules[member.user_id]
      rule.nil? || counts[rule[:policy_id]].fetch(member.user_id, 0) < rule[:limit]
    end
  end

  private

  # { user_id => { limit:, policy_id: } } for the agents of every policy that limits this inbox.
  def rules
    @rules ||= InboxCapacityLimit.where(inbox_id: inbox.id)
                                 .joins(agent_capacity_policy: :account_users)
                                 .where(account_users: { account_id: inbox.account_id })
                                 .pluck('account_users.user_id', 'inbox_capacity_limits.conversation_limit',
                                        'inbox_capacity_limits.agent_capacity_policy_id')
                                 .to_h { |user_id, limit, policy_id| [user_id, { limit: limit, policy_id: policy_id }] }
  end

  # Open conversations per agent of one policy, counted with that policy's own exclusion rules
  # (two policies on one inbox never borrow each other's exclusions).
  def open_counts(policy_id)
    user_ids = rules.select { |_, rule| rule[:policy_id] == policy_id }.keys
    counted_conversations(policies_by_id.fetch(policy_id)).where(assignee_id: user_ids).group(:assignee_id).count
  end

  def counted_conversations(policy)
    scope = inbox.conversations.open
    labels = policy.excluded_labels
    scope = scope.tagged_with(labels, exclude: true, on: :labels) if labels.any?
    hours = policy.exclude_older_than_hours
    scope = scope.where('conversations.last_activity_at >= ?', hours.hours.ago) if hours
    scope
  end

  def policies_by_id
    @policies_by_id ||= AgentCapacityPolicy.where(account_id: inbox.account_id, id: rules.values.pluck(:policy_id).uniq)
                                           .index_by(&:id)
  end
end
