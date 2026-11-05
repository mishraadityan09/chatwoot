# FlightsMojo (FM-39): loads the tickets and agents for a distribution, asks the
# Planner who gets what and turns the answer into the preview the administrator
# sees. Nothing is changed here; ApplyJob carries the moves out after Confirm.
class TicketDistribution::PlanBuilder
  MAX_TICKETS = 5000

  class InvalidRequest < StandardError; end

  # filters: { inbox_ids: [], team_id: nil, include_snoozed: false }
  def initialize(account:, agent_ids:, filters: {})
    @account = account
    @agent_ids = Array(agent_ids).map(&:to_i).uniq
    @inbox_ids = Array(filters[:inbox_ids]).map(&:to_i).uniq
    @team_id = filters[:team_id].presence&.to_i
    @include_snoozed = ActiveModel::Type::Boolean.new.cast(filters[:include_snoozed]) || false
  end

  def perform
    validate!
    tickets = load_tickets
    @members = members_by_inbox(tickets)
    result = TicketDistribution::Planner.new(tickets: tickets, agent_ids: picked_ids, members_by_inbox: @members,
                                             admin_ids: admin_ids).perform
    build_preview(tickets, result)
  end

  def statuses
    @include_snoozed ? %w[open snoozed] : %w[open]
  end

  private

  def validate!
    raise InvalidRequest, 'Pick at least one agent' if @agent_ids.empty?
    raise InvalidRequest, 'Some of the picked agents are not in this account' if picked_users.size != @agent_ids.size
    raise InvalidRequest, 'Unknown inbox' if @inbox_ids.any? && @account.inboxes.where(id: @inbox_ids).count != @inbox_ids.size
    raise InvalidRequest, 'Unknown team' if @team_id && !@account.teams.exists?(id: @team_id)
  end

  def picked_users
    @picked_users ||= @account.account_users.where(user_id: @agent_ids).includes(:user).to_a
  end

  # Keep the order the administrator sees (by the name shown) so ties are stable.
  def picked_ids
    @picked_ids ||= picked_users.sort_by { |account_user| [account_user.user.available_name.to_s.downcase, account_user.user_id] }
                                .map(&:user_id)
  end

  def admin_ids
    picked_users.select(&:administrator?).map(&:user_id)
  end

  def scope
    conversations = @account.conversations.where(status: statuses, assignee_agent_bot_id: nil)
    conversations = conversations.where(inbox_id: @inbox_ids) if @inbox_ids.any?
    conversations = conversations.where(team_id: @team_id) if @team_id
    conversations
  end

  TICKET_COLUMNS = %i[id inbox_id assignee_id priority created_at last_activity_at].freeze

  def load_tickets
    rows = scope.reorder(:id).limit(MAX_TICKETS + 1).pluck(*TICKET_COLUMNS)
    raise InvalidRequest, "More than #{MAX_TICKETS} tickets match. Narrow it down by inbox or team." if rows.size > MAX_TICKETS

    rows.map do |row|
      attributes = TICKET_COLUMNS.zip(row).to_h
      attributes[:last_activity_at] ||= attributes[:created_at]
      TicketDistribution::Planner::Ticket.new(**attributes)
    end
  end

  def members_by_inbox(tickets)
    inbox_ids = tickets.map(&:inbox_id).uniq
    InboxMember.where(inbox_id: inbox_ids, user_id: @agent_ids).pluck(:inbox_id, :user_id)
               .group_by(&:first).transform_values { |pairs| pairs.map(&:last) }
  end

  def build_preview(tickets, result)
    moves = result.moves(tickets)
    {
      ticket_count: tickets.size,
      moves: moves,
      unassigned_before: tickets.count { |ticket| ticket.assignee_id.nil? },
      agents: picked_summary(tickets, result, moves),
      others: others_summary(tickets, moves),
      unplaceable: unplaceable_summary(result.unplaceable),
      auto_assignment_inbox_ids: auto_assignment_inbox_ids,
      statuses: statuses
    }
  end

  def picked_summary(tickets, result, moves)
    users = picked_users.index_by(&:user_id)
    picked_ids.map do |agent_id|
      account_user = users[agent_id]
      {
        id: agent_id,
        name: account_user.user.available_name,
        role: account_user.role,
        before: tickets.count { |ticket| ticket.assignee_id == agent_id },
        after: result.counts[agent_id] + result.unplaceable.count { |ticket| ticket.assignee_id == agent_id },
        incoming: moves.count { |move| move[2] == agent_id },
        outgoing: moves.count { |move| move[1] == agent_id },
        can_take: can_take(account_user, tickets)
      }
    end
  end

  # How many of these tickets the agent could open at all (0 = not in any of their inboxes).
  def can_take(account_user, tickets)
    return tickets.size if account_user.administrator?

    tickets.count { |ticket| (@members[ticket.inbox_id] || []).include?(account_user.user_id) }
  end

  # Agents who were not picked but hold tickets in the pool, plus "unassigned".
  def others_summary(tickets, moves)
    holder_ids = tickets.map(&:assignee_id).uniq - picked_ids
    names = User.where(id: holder_ids.compact).pluck(:id, :name).to_h
    rows = holder_ids.map do |holder_id|
      before = tickets.count { |ticket| ticket.assignee_id == holder_id }
      outgoing = moves.count { |move| move[1] == holder_id }
      { id: holder_id, name: holder_id ? names[holder_id] : nil, before: before, after: before - outgoing, outgoing: outgoing }
    end
    rows.sort_by { |row| [-row[:before], row[:name].to_s] }
  end

  def unplaceable_summary(tickets)
    names = @account.inboxes.where(id: tickets.map(&:inbox_id).uniq).pluck(:id, :name).to_h
    rows = tickets.group_by(&:inbox_id).map do |inbox_id, list|
      { inbox_id: inbox_id, inbox_name: names[inbox_id], count: list.size }
    end
    rows.sort_by { |row| -row[:count] }
  end

  # Inboxes this distribution covers (all of them when none was chosen) that still
  # auto-assign new tickets; the administrator may switch that off on Confirm.
  def auto_assignment_inbox_ids
    inboxes = @inbox_ids.any? ? @account.inboxes.where(id: @inbox_ids) : @account.inboxes
    inboxes.where(enable_auto_assignment: true).order(:id).pluck(:id)
  end
end
