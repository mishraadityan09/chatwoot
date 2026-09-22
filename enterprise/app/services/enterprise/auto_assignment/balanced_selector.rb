class Enterprise::AutoAssignment::BalancedSelector
  pattr_initialize [:inbox!]

  def select_agent(available_agents, preferred_user_id: nil)
    return nil if available_agents.empty?

    agent_users = available_agents.map(&:user)
    # FlightsMojo: a sticky (preferred) agent who passed the capacity filter
    # takes precedence over load balancing.
    preferred = agent_users.find { |user| user.id == preferred_user_id.to_i } if preferred_user_id
    return preferred if preferred

    assignment_counts = fetch_assignment_counts(agent_users)

    agent_users.min_by { |user| assignment_counts[user.id] || 0 }
  end

  private

  def fetch_assignment_counts(users)
    user_ids = users.map(&:id)

    counts = inbox.conversations
                  .open
                  .where(assignee_id: user_ids)
                  .group(:assignee_id)
                  .count

    Hash.new(0).merge(counts)
  end
end
