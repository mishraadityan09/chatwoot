# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: the most open conversations one agent of a capacity policy may hold in one inbox.
RSpec.describe InboxCapacityLimit do
  let(:account) { create(:account) }
  let(:policy) { AgentCapacityPolicy.create!(account: account, name: 'Limits') }
  let(:inbox) { create(:inbox, account: account) }

  it 'allows zero (no new conversations) but not a negative or fractional limit' do
    expect(described_class.new(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 0)).to be_valid
    expect(described_class.new(agent_capacity_policy: policy, inbox: inbox, conversation_limit: -1)).not_to be_valid
    expect(described_class.new(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 1.5)).not_to be_valid
  end

  it 'has one limit per inbox in a policy' do
    described_class.create!(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 3)

    expect(described_class.new(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 4)).not_to be_valid
  end

  it 'only takes inboxes of the same account' do
    other_inbox = create(:inbox, account: create(:account))

    expect(described_class.new(agent_capacity_policy: policy, inbox: other_inbox, conversation_limit: 3)).not_to be_valid
  end
end
