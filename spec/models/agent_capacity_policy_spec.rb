# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: agent capacity policies (max open conversations per agent per inbox).
RSpec.describe AgentCapacityPolicy do
  let(:account) { create(:account) }

  it 'needs a name' do
    expect(described_class.new(account: account, name: '')).not_to be_valid
  end

  describe 'exclusion rules' do
    it 'cleans up labels and keeps whole hours' do
      policy = described_class.create!(account: account, name: 'Limits',
                                       exclusion_rules: { 'excluded_labels' => [' vip ', 'vip', ''], 'exclude_older_than_hours' => '48' })

      expect(policy.excluded_labels).to eq(['vip'])
      expect(policy.exclude_older_than_hours).to eq(48)
    end

    it 'accepts no rules at all' do
      policy = described_class.create!(account: account, name: 'Limits')

      expect(policy.excluded_labels).to eq([])
      expect(policy.exclude_older_than_hours).to be_nil
    end

    it 'rejects hours that are not a positive whole number' do
      %w[0 abc -3].each do |hours|
        policy = described_class.new(account: account, name: 'Limits', exclusion_rules: { 'exclude_older_than_hours' => hours })
        expect(policy).not_to be_valid
      end
    end
  end

  describe 'removing a policy' do
    it 'frees its agents and drops its limits' do
      policy = described_class.create!(account: account, name: 'Limits')
      account_user = create(:account_user, account: account, agent_capacity_policy: policy)
      inbox = create(:inbox, account: account)
      InboxCapacityLimit.create!(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 5)

      policy.destroy!

      expect(account_user.reload.agent_capacity_policy).to be_nil
      expect(InboxCapacityLimit.where(inbox_id: inbox.id)).to be_empty
    end
  end
end
