require 'rails_helper'

RSpec.describe TicketDistribution::ApplyJob do
  let(:account) { create(:account) }
  let(:administrator) { create(:user, account: account, role: :administrator, name: 'Harsh') }
  let(:agent) { create(:user, account: account, role: :agent, name: 'Anmol') }
  let(:inbox) { create(:inbox, account: account, enable_auto_assignment: false) }
  let(:token) { SecureRandom.uuid }

  def run(moves)
    described_class.perform_now(account_id: account.id, user_id: administrator.id, token: token, moves: moves)
  end

  it 'moves tickets that are still as previewed and skips the ones that changed' do
    still_open = create(:conversation, account: account, inbox: inbox, status: :open)
    resolved_since = create(:conversation, account: account, inbox: inbox, status: :resolved)
    taken_since = create(:conversation, account: account, inbox: inbox, status: :open, assignee: administrator)

    run([[still_open.id, nil, agent.id], [resolved_since.id, nil, agent.id], [taken_since.id, nil, agent.id]])

    expect(still_open.reload.assignee_id).to eq(agent.id)
    expect(resolved_since.reload.assignee_id).to be_nil
    expect(taken_since.reload.assignee_id).to eq(administrator.id)
    expect(TicketDistribution::Store.read_status(token, account_id: account.id))
      .to include('state' => 'done', 'total' => 3, 'moved' => 1, 'skipped' => 2)
  end

  it 'writes "Assigned to X by <administrator>" on the timeline' do
    conversation = create(:conversation, account: account, inbox: inbox, status: :open)

    perform_enqueued_jobs(only: Conversations::ActivityMessageJob) { run([[conversation.id, nil, agent.id]]) }

    expect(conversation.messages.activity.pluck(:content)).to include('Assigned to Anmol by Harsh')
  end

  it 'sends one summary email instead of a notification per ticket' do
    conversations = create_list(:conversation, 3, account: account, inbox: inbox, status: :open)
    allow(Rails.configuration.dispatcher).to receive(:dispatch).and_call_original

    expect { run(conversations.map { |conversation| [conversation.id, nil, agent.id] }) }
      .to have_enqueued_mail(TicketDistributionMailer, :summary).once

    expect(Rails.configuration.dispatcher).to have_received(:dispatch)
      .with(Events::Types::ASSIGNEE_CHANGED, anything, hash_including(notifiable_assignee_change: false)).exactly(3).times
    expect(Rails.configuration.dispatcher).not_to have_received(:dispatch)
      .with(Events::Types::ASSIGNEE_CHANGED, anything, hash_including(notifiable_assignee_change: true))
    expect(TicketDistribution::QuietAssignment.active?).to be(false)
  end

  it 'sends no summary to an agent who switched assignment emails off' do
    agent.notification_settings.find_by(account_id: account.id).update!(selected_email_flags: [])
    conversation = create(:conversation, account: account, inbox: inbox, status: :open)

    expect { run([[conversation.id, nil, agent.id]]) }.not_to have_enqueued_mail(TicketDistributionMailer, :summary)
  end

  it 'still notifies normally outside a distribution' do
    conversation = create(:conversation, account: account, inbox: inbox, status: :open)
    allow(Rails.configuration.dispatcher).to receive(:dispatch).and_call_original

    conversation.update!(assignee: agent)

    expect(Rails.configuration.dispatcher).to have_received(:dispatch)
      .with(Events::Types::ASSIGNEE_CHANGED, anything, hash_including(notifiable_assignee_change: true))
  end
end
