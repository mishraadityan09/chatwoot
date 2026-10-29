# FlightsMojo: "balanced" assignment order. The agent holding the fewest open conversations
# in the inbox gets the next one; agents with the same load take turns (round robin). A
# preferred (sticky) agent, already allowed by the other filters, still goes first.
class AutoAssignment::BalancedSelector
  pattr_initialize [:inbox!]

  # available_agents: inbox members. Returns a User, like the round robin selector.
  def select_agent(available_agents, preferred_user_id: nil)
    members = available_agents.to_a
    return nil if members.empty?

    preferred = members.find { |member| member.user_id == preferred_user_id.to_i }
    return preferred.user if preferred

    counts = open_counts(members.map(&:user_id))
    fewest = members.map { |member| counts.fetch(member.user_id, 0) }.min
    least_loaded = members.select { |member| counts.fetch(member.user_id, 0) == fewest }
    round_robin_selector.select_agent(least_loaded)
  end

  private

  def open_counts(user_ids)
    inbox.conversations.open.where(assignee_id: user_ids).group(:assignee_id).count
  end

  def round_robin_selector
    @round_robin_selector ||= AutoAssignment::RoundRobinSelector.new(inbox: inbox)
  end
end
