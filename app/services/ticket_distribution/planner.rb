# FlightsMojo (FM-39): decides who gets which ticket when an administrator shares
# unsolved tickets equally among the agents they picked. Pure Ruby, no database:
# PlanBuilder loads the data, ApplyJob carries the moves out.
#
# Rules, in order:
#   1. A ticket can only go to a picked agent who can open it: a member of the
#      ticket's inbox, or an administrator (administrators see every inbox).
#      A ticket nobody picked can open stays exactly as it is ("unplaceable").
#   2. Fewest moves: a picked agent keeps the tickets they already hold, up to
#      their equal share, keeping the ones with the most recent activity.
#   3. Everything else is handed out most-constrained first (tickets only one
#      picked agent can open), then urgent before low, then oldest first, each
#      to the eligible agent furthest below their share.
#   4. A final pass moves tickets from the busiest to the least busy agent while
#      they differ by two or more and a ticket can legally move between them.
class TicketDistribution::Planner
  Ticket = Struct.new(:id, :inbox_id, :assignee_id, :priority, :created_at, :last_activity_at, keyword_init: true)
  Result = Struct.new(:owners, :unplaceable, :counts, keyword_init: true) do
    # [[ticket_id, from_agent_id_or_nil, to_agent_id], ...] for tickets whose owner changes
    def moves(tickets)
      tickets.filter_map do |ticket|
        to = owners[ticket.id]
        next if to.nil? || to == ticket.assignee_id

        [ticket.id, ticket.assignee_id, to]
      end
    end
  end

  # Urgent first, unset priority last.
  PRIORITY_ORDER = { 'urgent' => 0, 'high' => 1, 'medium' => 2, 'low' => 3 }.freeze

  # tickets: [Ticket]; agent_ids: the picked agents, in a stable order;
  # members_by_inbox: { inbox_id => [user_id, ...] }; admin_ids: picked agents who are administrators.
  def initialize(tickets:, agent_ids:, members_by_inbox:, admin_ids: [])
    @tickets = tickets
    @agent_ids = agent_ids.uniq
    @members_by_inbox = members_by_inbox
    @admin_ids = admin_ids & @agent_ids
    @order = @agent_ids.each_with_index.to_h
  end

  def perform
    @eligible = @tickets.to_h { |ticket| [ticket.id, eligible_agents(ticket)] }
    placeable, unplaceable = @tickets.partition { |ticket| @eligible[ticket.id].any? }
    @owners = {}
    @counts = @agent_ids.index_with { 0 }
    return Result.new(owners: @owners, unplaceable: unplaceable, counts: @counts) if placeable.empty?

    quotas = build_quotas(placeable)
    keep_current_holders(placeable, quotas)
    hand_out(placeable.reject { |ticket| @owners.key?(ticket.id) }, quotas)
    even_out(placeable)
    Result.new(owners: @owners, unplaceable: unplaceable, counts: @counts)
  end

  private

  def eligible_agents(ticket)
    members = @members_by_inbox[ticket.inbox_id] || []
    @agent_ids.select { |agent_id| @admin_ids.include?(agent_id) || members.include?(agent_id) }
  end

  # Equal shares that respect how many tickets each agent can open at all
  # (water-filling): the most limited agents are served first, and when the
  # count does not divide evenly the extra tickets go to agents who already
  # hold more of them, so fewer tickets have to move.
  def build_quotas(placeable)
    capacity = capacities(placeable)
    remaining = placeable.size
    sorted = quota_order(placeable, capacity)
    sorted.each_with_index.to_h do |agent_id, index|
      left = sorted.size - index
      share = [capacity[agent_id], left == 1 ? remaining : remaining / left].min
      remaining -= share
      [agent_id, share]
    end
  end

  # How many of these tickets each agent could open at all.
  def capacities(placeable)
    @agent_ids.index_with { |agent_id| placeable.count { |ticket| @eligible[ticket.id].include?(agent_id) } }
  end

  # Most limited agents first; among equals, those holding fewer tickets first,
  # so the ones holding more absorb the remainder and keep more of their own.
  def quota_order(placeable, capacity)
    held = placeable.map(&:assignee_id).tally
    @agent_ids.sort_by { |agent_id| [capacity[agent_id], held.fetch(agent_id, 0), @order[agent_id]] }
  end

  def keep_current_holders(placeable, quotas)
    kept = placeable.select { |ticket| @eligible[ticket.id].include?(ticket.assignee_id) }.group_by(&:assignee_id)
    kept.each do |agent_id, tickets|
      tickets.sort_by { |ticket| [-ticket.last_activity_at.to_i, ticket.id] }.first(quotas[agent_id]).each do |ticket|
        give(ticket, agent_id)
      end
    end
  end

  def hand_out(tickets, quotas)
    tickets.sort_by { |ticket| [@eligible[ticket.id].size, priority_rank(ticket), ticket.created_at.to_i, ticket.id] }.each do |ticket|
      agent_id = @eligible[ticket.id].min_by { |id| [@counts[id] - quotas[id], @counts[id], @order[id]] }
      give(ticket, agent_id)
    end
  end

  def even_out(placeable)
    owned = placeable.group_by { |ticket| @owners[ticket.id] }
    placeable.size.times do
      break unless move_one(owned)
    end
  end

  # Moves one ticket from a busier agent to a less busy one (difference of two
  # or more). Prefers tickets that were handed out over ones the agent kept.
  def move_one(owned)
    by_load = @agent_ids.sort_by { |agent_id| [@counts[agent_id], @order[agent_id]] }
    by_load.each do |low|
      by_load.reverse_each do |high|
        break if @counts[high] - @counts[low] < 2

        ticket = movable_ticket(owned[high], low, high)
        next unless ticket

        owned[high].delete(ticket)
        (owned[low] ||= []) << ticket
        @counts[high] -= 1
        give(ticket, low)
        return true
      end
    end
    false
  end

  def movable_ticket(tickets, to_agent, from_agent)
    candidates = (tickets || []).select { |ticket| @eligible[ticket.id].include?(to_agent) }
    candidates.min_by { |ticket| [ticket.assignee_id == from_agent ? 1 : 0, ticket.last_activity_at.to_i, ticket.id] }
  end

  def give(ticket, agent_id)
    @owners[ticket.id] = agent_id
    @counts[agent_id] += 1
  end

  def priority_rank(ticket)
    PRIORITY_ORDER.fetch(ticket.priority.to_s, PRIORITY_ORDER.size)
  end
end
