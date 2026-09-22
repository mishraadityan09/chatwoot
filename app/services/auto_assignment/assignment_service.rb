class AutoAssignment::AssignmentService
  pattr_initialize [:inbox!]

  # FlightsMojo: a returning customer goes back to the agent who last replied
  # to them, provided that reply is no older than this. Measured from the
  # reply itself, so an assignment the agent never answered doesn't count and
  # the window really does expire.
  STICKY_ASSIGNMENT_LOOKBACK = 90.days

  def perform_bulk_assignment(limit: 100)
    return 0 unless inbox.auto_assignment_v2_enabled?
    return 0 unless inbox.enable_auto_assignment?

    conversations = unassigned_conversations(limit).to_a
    return 0 if conversations.empty?
    return 0 if inbox.available_agents.empty?

    assigned_count = 0
    conversations.each do |conversation|
      assigned_count += 1 if perform_for_conversation(conversation)
    end
    assigned_count
  end

  private

  def perform_for_conversation(conversation)
    return false unless assignable?(conversation)

    agent = find_available_agent(conversation)
    return false unless agent

    assign_conversation(conversation, agent)
  end

  def assignable?(conversation)
    conversation.status == 'open' &&
      conversation.assignee_id.nil?
  end

  def unassigned_conversations(limit)
    scope = inbox.conversations.unassigned.open

    # Skip stale backlog with no activity beyond the age threshold
    policy = inbox.assignment_policy
    scope = apply_age_exclusions(scope, age_exclusion_hours(policy))

    # Apply conversation priority using assignment policy if available
    scope = if policy&.longest_waiting?
              scope.reorder(last_activity_at: :asc, created_at: :asc)
            else
              scope.reorder(created_at: :asc)
            end

    scope.limit(limit)
  end

  def age_exclusion_hours(policy)
    return policy.exclude_older_than_hours if policy

    AssignmentPolicy::DEFAULT_EXCLUDE_OLDER_THAN_HOURS
  end

  def apply_age_exclusions(scope, hours_threshold)
    return scope if hours_threshold.blank?

    hours = hours_threshold.to_i
    return scope unless hours.positive?

    # Use last_activity_at so reopened/active conversations aren't excluded by their original created_at
    scope.where('conversations.last_activity_at >= ?', hours.hours.ago)
  end

  def find_available_agent(conversation = nil)
    agents = filter_agents_by_team(inbox.available_agents, conversation)
    return nil if agents.nil?

    agents = filter_agents_by_rate_limit(agents)
    return nil if agents.empty?

    # FlightsMojo: the sticky preference is applied by the selector, after
    # every eligibility filter above, so it can never bypass a gate round
    # robin enforces. The enterprise override passes the same preference.
    round_robin_selector.select_agent(agents, preferred_user_id: sticky_agent_id(conversation))
  end

  # FlightsMojo: sticky assignment. The id of the agent who most recently
  # replied to this customer within STICKY_ASSIGNMENT_LOOKBACK, in any of the
  # contact's conversations — or nil. (Chatwoot keeps one contact per email /
  # phone number per account, so a channel that shares an identifier already
  # shares the contact.) Only public replies by a human count: bot messages,
  # private notes, campaign sends and unanswered assignments do not.
  # Kill switch: DISABLE_STICKY_ASSIGNMENT=true.
  def sticky_agent_id(conversation)
    return nil if sticky_assignment_disabled?

    conversation_ids = conversation.contact.conversations.where.not(id: conversation.id).select(:id)

    # reorder: Message's default scope orders ascending.
    Message.where(conversation_id: conversation_ids)
           .outgoing
           .where(sender_type: 'User', private: false)
           .where("(messages.additional_attributes->'campaign_id') IS NULL")
           .where(created_at: STICKY_ASSIGNMENT_LOOKBACK.ago..)
           .reorder(created_at: :desc)
           .pick(:sender_id)
  end

  def sticky_assignment_disabled?
    ActiveModel::Type::Boolean.new.cast(ENV.fetch('DISABLE_STICKY_ASSIGNMENT', false))
  end

  def filter_agents_by_team(agents, conversation)
    return agents if conversation&.team_id.blank?

    team = conversation.team
    return nil if team.blank? || team.allow_auto_assign.blank?

    team_member_ids = team.members.ids
    agents.where(user_id: team_member_ids)
  end

  def filter_agents_by_rate_limit(agents)
    agents.select do |agent_member|
      rate_limiter = build_rate_limiter(agent_member.user)
      rate_limiter.within_limit?
    end
  end

  def assign_conversation(conversation, agent)
    return false unless claim_and_assign(conversation, agent)

    conversation.reload

    rate_limiter = build_rate_limiter(agent)
    rate_limiter.track_assignment(conversation)

    dispatch_assignment_event(conversation, agent)
    true
  end

  # Atomically claim the row so two bulk runs that overlap (the in-flight gate
  # is best-effort and can lapse on TTL) can't both assign the same conversation.
  def claim_and_assign(conversation, agent)
    Current.executed_by = inbox.assignment_policy || inbox

    Conversation.transaction do
      locked = inbox.conversations
                    .where(id: conversation.id).unassigned
                    .lock('FOR UPDATE SKIP LOCKED')
                    .first
      next false unless locked

      locked.update!(assignee: agent)
      true
    end
  ensure
    Current.executed_by = nil
  end

  def dispatch_assignment_event(conversation, agent)
    Rails.configuration.dispatcher.dispatch(
      Events::Types::ASSIGNEE_CHANGED,
      Time.zone.now,
      conversation: conversation,
      user: agent
    )
  end

  def build_rate_limiter(agent)
    AutoAssignment::RateLimiter.new(inbox: inbox, agent: agent)
  end

  def round_robin_selector
    @round_robin_selector ||= AutoAssignment::RoundRobinSelector.new(inbox: inbox)
  end
end

AutoAssignment::AssignmentService.prepend_mod_with('AutoAssignment::AssignmentService')
