# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: assignment v2 honours agent capacity policies and the balanced order.
RSpec.describe AutoAssignment::AssignmentService do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account, enable_auto_assignment: true) }
  let(:service) { described_class.new(inbox: inbox) }
  let(:busy_agent) { create(:user, account: account, role: :agent, availability: :online) }
  let(:free_agent) { create(:user, account: account, role: :agent, availability: :online) }
  let(:capacity_policy) { AgentCapacityPolicy.create!(account: account, name: 'Max 2') }
  let(:rate_limiter) { instance_double(AutoAssignment::RateLimiter, within_limit?: true, track_assignment: nil) }

  def new_open_conversation
    create(:conversation, inbox: inbox, account: account, status: 'open').tap { |conversation| conversation.update!(assignee_id: nil) }
  end

  before do
    account.enable_features!('assignment_v2')
    create(:inbox_member, inbox: inbox, user: busy_agent)
    create(:inbox_member, inbox: inbox, user: free_agent)
    allow(OnlineStatusTracker).to receive(:get_available_users)
      .and_return({ busy_agent.id.to_s => 'online', free_agent.id.to_s => 'online' })
    allow(AutoAssignment::RateLimiter).to receive(:new).and_return(rate_limiter)
  end

  describe 'agent capacity' do
    before do
      InboxCapacityLimit.create!(agent_capacity_policy: capacity_policy, inbox: inbox, conversation_limit: 2)
      account.account_users.find_by(user_id: busy_agent.id).update!(agent_capacity_policy: capacity_policy)
      2.times { create(:conversation, inbox: inbox, account: account, status: 'open', assignee: busy_agent) }
    end

    it 'gives the conversation to an agent with room, not to the agent at the limit' do
      conversation = new_open_conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(free_agent)
    end

    it 'leaves the conversation unassigned when everyone is at the limit' do
      account.account_users.find_by(user_id: free_agent.id).update!(agent_capacity_policy: capacity_policy)
      2.times { create(:conversation, inbox: inbox, account: account, status: 'open', assignee: free_agent) }
      conversation = new_open_conversation

      expect(service.perform_bulk_assignment(limit: 1)).to eq(0)
      expect(conversation.reload.assignee).to be_nil
    end

    it 'counts only open conversations of this inbox' do
      other_inbox = create(:inbox, account: account)
      create(:conversation, inbox: other_inbox, account: account, status: 'open', assignee: free_agent)
      busy_agent.assigned_conversations.first.update!(status: :resolved)
      conversation = new_open_conversation

      service.perform_bulk_assignment(limit: 1)

      expect([busy_agent, free_agent]).to include(conversation.reload.assignee)
    end

    it 'does not limit agents of inboxes the policy has no limit for' do
      other_inbox = create(:inbox, account: account, enable_auto_assignment: true)
      create(:inbox_member, inbox: other_inbox, user: busy_agent)
      conversation = create(:conversation, inbox: other_inbox, account: account, status: 'open')
      conversation.update!(assignee_id: nil)

      described_class.new(inbox: other_inbox).perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(busy_agent)
    end
  end

  describe 'exclusion rules' do
    let(:capacity_policy) do
      AgentCapacityPolicy.create!(account: account, name: 'Rules',
                                  exclusion_rules: { 'excluded_labels' => ['manual'], 'exclude_older_than_hours' => 24 })
    end

    before do
      InboxCapacityLimit.create!(agent_capacity_policy: capacity_policy, inbox: inbox, conversation_limit: 1)
      account.account_users.find_by(user_id: busy_agent.id).update!(agent_capacity_policy: capacity_policy)
      account.account_users.find_by(user_id: free_agent.id).update!(agent_capacity_policy: capacity_policy)
      create(:conversation, inbox: inbox, account: account, status: 'open', assignee: free_agent)
    end

    it 'does not count conversations with an excluded label towards the limit' do
      held = create(:conversation, inbox: inbox, account: account, status: 'open', assignee: busy_agent)
      held.update!(label_list: ['manual'])
      conversation = new_open_conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(busy_agent)
    end

    it 'does not count conversations older than the set duration' do
      stale = create(:conversation, inbox: inbox, account: account, status: 'open', assignee: busy_agent)
      stale.update_columns(last_activity_at: 3.days.ago) # rubocop:disable Rails/SkipsModelValidations
      conversation = new_open_conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(busy_agent)
    end

    it 'still counts everything else' do
      create(:conversation, inbox: inbox, account: account, status: 'open', assignee: busy_agent)
      conversation = new_open_conversation

      expect(service.perform_bulk_assignment(limit: 1)).to eq(0)
      expect(conversation.reload.assignee).to be_nil
    end
  end

  describe 'balanced order' do
    before do
      policy = create(:assignment_policy, account: account, assignment_order: :balanced)
      create(:inbox_assignment_policy, inbox: inbox, assignment_policy: policy)
      3.times { create(:conversation, inbox: inbox, account: account, status: 'open', assignee: busy_agent) }
    end

    it 'gives the conversation to the agent with the fewest open ones' do
      conversation = new_open_conversation

      service.perform_bulk_assignment(limit: 1)

      expect(conversation.reload.assignee).to eq(free_agent)
    end
  end
end
