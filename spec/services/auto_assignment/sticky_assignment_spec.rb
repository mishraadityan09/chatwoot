require 'rails_helper'

# FlightsMojo: sticky assignment — a returning customer is preferred to the
# agent who last replied to them. Kept apart from the upstream spec so merges
# don't collide with it.
RSpec.describe AutoAssignment::AssignmentService, 'sticky assignment' do
  let(:account) { create(:account) }
  let(:assignment_policy) { create(:assignment_policy, account: account, enabled: true) }
  let(:inbox) { create(:inbox, account: account, enable_auto_assignment: true) }
  let(:service) { described_class.new(inbox: inbox) }
  let(:agent) { create(:user, account: account, role: :agent, availability: :online) }
  let(:agent2) { create(:user, account: account, role: :agent, availability: :online) }
  let(:round_robin) { AutoAssignment::InboxRoundRobinService.new(inbox: inbox) }
  let(:contact) { create(:contact, account: account) }
  let(:previous_conversation) { create(:conversation, account: account, inbox: inbox, contact: contact, assignee: agent2) }
  let(:reply_attributes) { {} }
  let(:reply) do
    create(:message, account: account, inbox: inbox, conversation: previous_conversation,
                     sender: agent2, message_type: :outgoing, **reply_attributes)
  end
  let(:conversation) { create(:conversation, account: account, inbox: inbox, contact: contact, assignee: nil) }

  before do
    account.enable_features('assignment_v2')
    account.save!
    create(:inbox_assignment_policy, inbox: inbox, assignment_policy: assignment_policy)
    create(:inbox_member, inbox: inbox, user: agent)
    create(:inbox_member, inbox: inbox, user: agent2)
    allow(OnlineStatusTracker).to receive(:get_available_users)
      .and_return({ agent.id.to_s => 'online', agent2.id.to_s => 'online' })
    # Queue order [agent2, agent]: round robin's next pick is `agent`, so an
    # assignment to agent2 can only come from the sticky preference.
    round_robin.reset_queue
    round_robin.available_agent(allowed_agent_ids: [agent2.id.to_s])
  end

  it 'assigns a returning customer to the agent who last replied to them' do
    reply
    conversation

    service.perform_bulk_assignment(limit: 1)

    expect(conversation.reload.assignee).to eq(agent2)
  end

  it 'counts a reply made in the conversation being assigned' do
    conversation
    create(:message, account: account, inbox: inbox, conversation: conversation, sender: agent2, message_type: :outgoing)

    service.perform_bulk_assignment(limit: 1)

    expect(conversation.reload.assignee).to eq(agent2)
  end

  it 'follows the most recent reply when several agents have replied' do
    create(:message, account: account, inbox: inbox, conversation: previous_conversation,
                     sender: agent2, message_type: :outgoing, created_at: 2.days.ago)
    create(:message, account: account, inbox: inbox, conversation: previous_conversation,
                     sender: agent, message_type: :outgoing, created_at: 1.day.ago)
    # Queue order [agent, agent2]: round robin's next pick would be agent2.
    round_robin.available_agent(allowed_agent_ids: [agent.id.to_s])
    conversation

    service.perform_bulk_assignment(limit: 1)

    expect(conversation.reload.assignee).to eq(agent)
  end

  it 'moves the sticky agent to the back of the round-robin rotation' do
    agent3 = create(:user, account: account, role: :agent, availability: :online)
    create(:inbox_member, inbox: inbox, user: agent3)
    # `inbox` already loaded its members in the before block; without a reset
    # the queue is rebuilt without agent3.
    inbox.inbox_members.reset
    allow(OnlineStatusTracker).to receive(:get_available_users)
      .and_return({ agent.id.to_s => 'online', agent2.id.to_s => 'online', agent3.id.to_s => 'online' })
    # Queue order [agent, agent3, agent2]: agent2 is next anyway. After the
    # sticky pick the rotation leaves [agent2, agent, agent3], so the next
    # new customer goes to agent3; without it the queue would be unchanged
    # and they would go to agent2.
    round_robin.reset_queue
    round_robin.available_agent(allowed_agent_ids: [agent.id.to_s])
    reply
    conversation
    new_customer = create(:conversation, account: account, inbox: inbox, assignee: nil)

    service.perform_bulk_assignment(limit: 2)

    expect(conversation.reload.assignee).to eq(agent2)
    expect(new_customer.reload.assignee).to eq(agent3)
  end

  it 'falls back to round robin when the previous agent is not available' do
    reply
    allow(OnlineStatusTracker).to receive(:get_available_users).and_return({ agent.id.to_s => 'online' })
    conversation

    service.perform_bulk_assignment(limit: 1)

    expect(conversation.reload.assignee).to eq(agent)
  end

  it 'can be switched off with DISABLE_STICKY_ASSIGNMENT' do
    reply
    conversation

    with_modified_env DISABLE_STICKY_ASSIGNMENT: '1' do
      service.perform_bulk_assignment(limit: 1)
    end

    expect(conversation.reload.assignee).to eq(agent)
  end

  context 'when the previous assignment was never answered' do
    it 'does not stick' do
      previous_conversation
      conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(agent)
    end
  end

  context 'when the only reply is a private note' do
    let(:reply_attributes) { { private: true } }

    it 'does not stick' do
      reply
      conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(agent)
    end
  end

  context 'when the only reply is a campaign send' do
    let(:reply_attributes) { { additional_attributes: { campaign_id: 42 } } }

    it 'does not stick' do
      reply
      conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(agent)
    end
  end

  context 'when the last reply is older than the lookback window' do
    let(:reply_attributes) { { created_at: 91.days.ago } }

    it 'does not stick' do
      reply
      conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(agent)
    end
  end
end
