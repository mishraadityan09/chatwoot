require 'rails_helper'

# FlightsMojo (FM-40): a "Reply all" sent from the team mailbox in Outlook keeps the ticket's
# reply+ address; it must land as a private note, not as a message from the supplier.
RSpec.describe ReplyMailbox do
  include ActionMailbox::TestHelper

  let(:account) { create(:account) }
  let(:email_channel) { create(:channel_email, account: account, email: 'agency@example.com') }
  let(:contact) { create(:contact, account: account, email: 'supplier@example.com') }
  let(:conversation) { create(:conversation, account: account, inbox: email_channel.inbox, contact: contact, status: :resolved) }
  let(:ticket_address) { "reply+#{conversation.uuid}@#{account.inbound_email_domain}" }

  before do
    create(:message, conversation: conversation, account: account, inbox: email_channel.inbox, message_type: :incoming, content: 'Flight cancelled')
    conversation.update!(status: :resolved)
  end

  def receive_mail(from:)
    mail = create_inbound_email_from_mail(from: from, to: [ticket_address, 'supplier@example.com'], cc: 'agency@example.com',
                                          subject: 'Re: Flight cancelled', body: 'We rebooked the passenger')
    with_modified_env('FM_OUTLOOK_MIRROR' => "#{email_channel.inbox.id}:agency@example.com") { described_class.receive(mail) }
    conversation.reload.messages.last
  end

  it 'stores a reply from agency@ as a private note without reopening the ticket' do
    note = receive_mail(from: 'Agency Desk <agency@example.com>')

    expect(note).to have_attributes(private: true, message_type: 'outgoing', sender: nil, content_type: 'text')
    expect(note.content).to start_with('Sent from Outlook by agency@example.com · to supplier@example.com')
    expect(note.content).to include('We rebooked the passenger')
    expect(note.source_id).to be_present
    expect(conversation.reload.status).to eq('resolved')
  end

  it 'still stores a reply from the supplier as an incoming message that reopens the ticket' do
    message = receive_mail(from: 'supplier@example.com')

    expect(message).to have_attributes(private: false, message_type: 'incoming', sender: contact)
    expect(conversation.reload.status).to eq('open')
  end
end
