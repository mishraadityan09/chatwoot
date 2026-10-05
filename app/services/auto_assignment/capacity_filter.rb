# FlightsMojo: applies agent capacity policies to assignment v2. An agent whose policy sets
# a limit for this inbox gets no new conversation from it once they hold that many open
# ones. As the policy screen says, conversations with an excluded label, or older than the
# set duration, do not count towards the limit. With no policy for the inbox nothing changes.
class AutoAssignment::CapacityFilter
  pattr_initialize [:inbox!]

  # inbox_members: the agents that passed the other filters. Returns the ones with room left.
  def filter(inbox_members)
    members = inbox_members.to_a
    return members if limits.empty?

    counts = open_counts(limits.keys & members.map(&:user_id))
    members.select { |member| (limit = limits[member.user_id]).nil? || counts.fetch(member.user_id, 0) < limit }
  end

  private

  # { user_id => limit } for the agents of every policy that limits this inbox.
  def limits
    @limits ||= InboxCapacityLimit.where(inbox_id: inbox.id)
                                  .joins(agent_capacity_policy: :account_users)
                                  .where(account_users: { account_id: inbox.account_id })
                                  .pluck('account_users.user_id', 'inbox_capacity_limits.conversation_limit')
                                  .to_h
  end

  def open_counts(user_ids)
    return {} if user_ids.empty?

    counted_conversations.where(assignee_id: user_ids).group(:assignee_id).count
  end

  # Open conversations of the inbox, minus the ones the policies' exclusion rules leave out.
  def counted_conversations
    scope = inbox.conversations.open
    labels = excluded_labels
    scope = scope.tagged_with(labels, exclude: true, on: :labels) if labels.any?
    hours = exclude_older_than_hours
    scope = scope.where('conversations.last_activity_at >= ?', hours.hours.ago) if hours
    scope
  end

  def policies
    @policies ||= AgentCapacityPolicy.where(account_id: inbox.account_id)
                                     .where(id: InboxCapacityLimit.where(inbox_id: inbox.id).select(:agent_capacity_policy_id))
                                     .to_a
  end

  def excluded_labels
    policies.flat_map(&:excluded_labels).uniq
  end

  def exclude_older_than_hours
    policies.filter_map(&:exclude_older_than_hours).min
  end
end
