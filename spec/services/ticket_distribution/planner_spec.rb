require 'rails_helper'

RSpec.describe TicketDistribution::Planner do
  let(:now) { Time.zone.parse('2026-11-05 10:00') }

  def ticket(id, inbox: 1, assignee: nil, priority: nil, active: nil)
    created = now - id.minutes
    described_class::Ticket.new(id: id, inbox_id: inbox, assignee_id: assignee, priority: priority,
                                created_at: created, last_activity_at: active || created)
  end

  def plan(tickets, agents, members: { 1 => agents }, admins: [])
    described_class.new(tickets: tickets, agent_ids: agents, members_by_inbox: members, admin_ids: admins).perform
  end

  it 'splits unassigned tickets equally' do
    tickets = (1..9).map { |id| ticket(id) }
    result = plan(tickets, [10, 20, 30])

    expect(result.counts).to eq(10 => 3, 20 => 3, 30 => 3)
    expect(result.moves(tickets).size).to eq(9)
    expect(result.unplaceable).to be_empty
  end

  it 'gives the extra tickets of an uneven split to agents who already hold more (fewer moves)' do
    tickets = [ticket(1, assignee: 30), ticket(2, assignee: 30), ticket(3), ticket(4), ticket(5)]
    result = plan(tickets, [10, 20, 30])

    expect(result.counts.values.sort).to eq([1, 2, 2])
    expect(result.counts[30]).to eq(2)
    expect(result.moves(tickets).map(&:first)).to contain_exactly(3, 4, 5)
  end

  it 'keeps tickets with a picked agent up to their share and moves only the surplus' do
    tickets = (1..8).map { |id| ticket(id, assignee: 10, active: now - id.hours) } + (9..12).map { |id| ticket(id) }
    result = plan(tickets, [10, 20])

    expect(result.counts).to eq(10 => 6, 20 => 6)
    moves = result.moves(tickets)
    expect(moves.size).to eq(6)
    # the agent keeps the six with the most recent activity (ids 1..6); 7 and 8 move
    expect(moves.select { |move| move[1] == 10 }.map(&:first)).to contain_exactly(7, 8)
  end

  it 'takes every ticket away from agents who were not picked' do
    tickets = (1..4).map { |id| ticket(id, assignee: 99) }
    result = plan(tickets, [10, 20])

    expect(result.counts).to eq(10 => 2, 20 => 2)
    expect(result.moves(tickets).map { |move| move[1] }.uniq).to eq([99])
  end

  it 'never gives a ticket to an agent who is not in its inbox, and leaves tickets nobody can open alone' do
    tickets = [ticket(1, inbox: 1), ticket(2, inbox: 1), ticket(3, inbox: 2), ticket(4, inbox: 3, assignee: 99)]
    result = plan(tickets, [10, 20], members: { 1 => [10, 20], 2 => [20] })

    expect(result.owners[3]).to eq(20)
    expect(result.unplaceable.map(&:id)).to eq([4])
    expect(result.owners).not_to have_key(4)
    expect(result.counts).to eq(10 => 2, 20 => 1).or eq(10 => 1, 20 => 2)
  end

  it 'lets an administrator receive tickets from any inbox' do
    tickets = [ticket(1, inbox: 5), ticket(2, inbox: 5)]
    result = plan(tickets, [10, 20], members: {}, admins: [20])

    expect(result.counts).to eq(10 => 0, 20 => 2)
    expect(result.unplaceable).to be_empty
  end

  it 'evens out when inbox membership forces an uneven first pass' do
    # inbox 2 only agent 10 can open; the rest can go anywhere
    tickets = (1..4).map { |id| ticket(id, inbox: 2) } + (5..10).map { |id| ticket(id, inbox: 1, assignee: 10) }
    result = plan(tickets, [10, 20], members: { 1 => [10, 20], 2 => [10] })

    expect(result.counts).to eq(10 => 5, 20 => 5)
    expect(tickets.first(4).map { |t| result.owners[t.id] }.uniq).to eq([10])
  end

  it 'spreads urgent tickets across agents instead of giving them to one' do
    tickets = (1..4).map { |id| ticket(id, priority: 'urgent') } + (5..8).map { |id| ticket(id, priority: 'low') }
    result = plan(tickets, [10, 20])

    urgent_owners = tickets.first(4).map { |t| result.owners[t.id] }
    expect(urgent_owners.tally).to eq(10 => 2, 20 => 2)
  end

  it 'returns no moves when nothing can be placed' do
    tickets = [ticket(1, inbox: 7)]
    result = plan(tickets, [10], members: {})

    expect(result.moves(tickets)).to be_empty
    expect(result.unplaceable.size).to eq(1)
  end
end
