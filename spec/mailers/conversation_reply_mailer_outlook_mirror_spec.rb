require 'rails_helper'

# FlightsMojo (FM-40): the team mailbox in Cc on every mail an email inbox sends.
RSpec.describe ConversationReplyMailer do
  let(:account) { create(:account) }
  let(:class_instance) { described_class.new }
  let(:email_channel) { create(:channel_email, account: account, email: 'agency@example.com') }
  let(:conversation) { create(:conversation, account: account, inbox: email_channel.inbox) }
  let(:message) do
    create(:message, conversation: conversation, account: account, message_type: 'outgoing', content: 'Rebooked on the next flight',
                     content_attributes: { to_emails: ['supplier@example.com'], cc_emails: ['ops@example.com'], bcc_emails: ['audit@example.com'] })
  end
  let(:mail) { described_class.email_reply(message).deliver_now }

  before do
    allow(described_class).to receive(:new).and_return(class_instance)
    allow(class_instance).to receive(:smtp_config_set_or_development?).and_return(true)
  end

  it 'sends exactly what the agent chose when the setting is not set' do
    expect(mail.to).to eq(['supplier@example.com'])
    expect(mail.cc).to eq(['ops@example.com'])
    expect(mail.bcc).to eq(['audit@example.com'])
  end

  context 'when the inbox mirrors to agency@' do
    around { |example| with_modified_env('FM_OUTLOOK_MIRROR' => "#{email_channel.inbox.id}:agency@example.com") { example.run } }

    it 'adds agency@ to Cc and leaves To, Bcc, Reply-To and the Message-ID alone' do
      expect(mail.cc).to eq(%w[ops@example.com agency@example.com])
      expect(mail.to).to eq(['supplier@example.com'])
      expect(mail.bcc).to eq(['audit@example.com'])
      expect(mail.reply_to).to eq(["reply+#{conversation.uuid}@#{account.inbound_email_domain}"])
      expect(mail.message_id).to eq("conversation/#{conversation.uuid}/messages/#{message.id}@#{account.inbound_email_domain}")
    end

    it 'adds agency@ even when the agent left Cc empty' do
      message.update!(content_attributes: { to_emails: ['supplier@example.com'] })
      expect(mail.cc).to eq(['agency@example.com'])
    end

    it 'does not copy agency@ twice when it is already a recipient' do
      message.update!(content_attributes: { to_emails: ['supplier@example.com'], cc_emails: ['Agency@Example.com'] })
      expect(mail.cc).to eq(['Agency@Example.com'])
    end

    it 'leaves the mail of another inbox alone' do
      other = create(:conversation, account: account, inbox: create(:channel_email, account: account).inbox)
      other_message = create(:message, conversation: other, account: account, message_type: 'outgoing', content: 'Hi')
      expect(described_class.email_reply(other_message).deliver_now.cc).to be_nil
    end
  end
end
