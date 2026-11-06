require 'rails_helper'

# FlightsMojo (FM-40): the Cc that really went out is stored on the message.
describe Email::SendOnEmailService, type: :mailer do
  let(:account) { create(:account) }
  let(:email_channel) { create(:channel_email, account: account, email: 'agency@example.com') }
  let(:conversation) { create(:conversation, account: account, inbox: email_channel.inbox) }
  let(:agent) { create(:user, account: account) }
  let(:message) do
    create(:message, conversation: conversation, account: account, sender: agent, message_type: 'outgoing', content: 'Rebooked',
                     content_attributes: { cc_emails: ['ops@example.com'] })
  end
  let(:mailer) { ConversationReplyMailer.new }

  before do
    allow(ConversationReplyMailer).to receive(:new).and_return(mailer)
    allow(mailer).to receive(:smtp_config_set_or_development?).and_return(true)
  end

  it 'stores agency@ next to the agent Cc together with the source id' do
    with_modified_env('FM_OUTLOOK_MIRROR' => "#{email_channel.inbox.id}:agency@example.com") { described_class.new(message: message).perform }

    sent = ActionMailer::Base.deliveries.last
    expect(sent.cc).to eq(%w[ops@example.com agency@example.com])
    expect(message.reload.content_attributes[:cc_emails]).to eq(%w[ops@example.com agency@example.com])
    expect(message.source_id).to eq(sent.message_id)
  end

  it 'stores the Cc unchanged without the setting' do
    described_class.new(message: message).perform

    expect(message.reload.content_attributes[:cc_emails]).to eq(['ops@example.com'])
    expect(message.source_id).to eq(ActionMailer::Base.deliveries.last.message_id)
  end
end
