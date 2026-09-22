class AutoAssignment::RoundRobinSelector
  pattr_initialize [:inbox!]

  # FlightsMojo: preferred_user_id (the sticky agent) is taken when they are
  # in the available set; plain round robin otherwise.
  def select_agent(available_agents, preferred_user_id: nil)
    return nil if available_agents.empty?

    agent_user_ids = available_agents.map(&:user_id).map(&:to_s)
    round_robin_service.available_agent(allowed_agent_ids: agent_user_ids, preferred_agent_id: preferred_user_id&.to_s)
  end

  private

  def round_robin_service
    @round_robin_service ||= AutoAssignment::InboxRoundRobinService.new(inbox: inbox)
  end
end
