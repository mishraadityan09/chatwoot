require 'rails_helper'

# FlightsMojo (FM-34): the ticket table's column sorts.
RSpec.describe Conversations::SortService do
  let(:account) { create(:account) }
  let(:inbox) { create(:inbox, account: account, name: 'Beta mail') }

  def conversation(**attributes)
    create(:conversation, account: account, inbox: inbox, **attributes)
  end

  def sorted(key)
    described_class.apply(account.conversations, key).to_a
  end

  describe 'status' do
    it 'follows the ticket lifecycle, not the enum' do
      resolved = conversation(status: :resolved)
      snoozed = conversation(status: :snoozed)
      pending = conversation(status: :pending)
      open = conversation(status: :open)

      expect(sorted('status_asc')).to eq([open, pending, snoozed, resolved])
      expect(sorted('status_desc')).to eq([resolved, snoozed, pending, open])
    end
  end

  describe 'requester' do
    it 'orders by contact name, ignoring case' do
      zed = conversation(contact: create(:contact, account: account, name: 'zed'))
      amy = conversation(contact: create(:contact, account: account, name: 'Amy'))

      expect(sorted('requester_asc')).to eq([amy, zed])
      expect(sorted('requester_desc')).to eq([zed, amy])
    end
  end

  describe 'assignee' do
    it 'orders by agent name with unassigned tickets last' do
      zoya = create(:user, account: account, name: 'Zoya')
      aarav = create(:user, account: account, name: 'aarav')
      unassigned = conversation
      with_zoya = conversation(assignee: zoya)
      with_aarav = conversation(assignee: aarav)

      expect(sorted('assignee_asc')).to eq([with_aarav, with_zoya, unassigned])
      expect(sorted('assignee_desc')).to eq([with_zoya, with_aarav, unassigned])
    end
  end

  describe 'team' do
    it 'orders by team name with tickets without a team last' do
      refunds = create(:team, account: account, name: 'refunds')
      cancellations = create(:team, account: account, name: 'cancellations')
      no_team = conversation
      with_refunds = conversation(team: refunds)
      with_cancellations = conversation(team: cancellations)

      expect(sorted('team_asc')).to eq([with_cancellations, with_refunds, no_team])
      expect(sorted('team_desc')).to eq([with_refunds, with_cancellations, no_team])
    end
  end

  describe 'inbox' do
    it 'orders by inbox name' do
      alpha = create(:inbox, account: account, name: 'alpha chat')
      in_beta = conversation
      in_alpha = conversation(inbox: alpha)

      expect(sorted('inbox_asc')).to eq([in_alpha, in_beta])
      expect(sorted('inbox_desc')).to eq([in_beta, in_alpha])
    end
  end

  it 'still falls back to last activity for unknown keys' do
    older = conversation(last_activity_at: 2.hours.ago)
    newer = conversation(last_activity_at: 1.hour.ago)

    expect(sorted('no_such_sort')).to eq([newer, older])
  end
end
