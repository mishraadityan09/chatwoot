require 'rails_helper'

# FlightsMojo (FM-41): a new mail goes to the inbox Settings → Email Routing ranks first, and only
# once, even when two of our mailboxes forward it.
RSpec.describe ReplyMailbox do
  include ActionMailbox::TestHelper

  let(:account) { create(:account) }
  let(:care) { create(:channel_email, account: account, email: 'care@example.com') }
  let(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }

  # One forwarded copy, as Postfix hands it over: X-Original-To = the forwarding address it came to.
  def deliver(copy_for:, **overrides)
    fields = { from: 'customer@example.net', to: 'care@example.com', cc: 'legal@example.com', message_id: 'complaint-1@mail.example.net',
               subject: 'Refund not received' }.merge(overrides)
    mail = Mail.new(fields.except(:message_id).merge(body: 'Please help', message_id: "<#{fields[:message_id]}>"))
    mail['X-Original-To'] = copy_for.forward_to_email
    described_class.receive(create_inbound_email_from_source(mail.to_s))
  end

  def save_routes
    account.update!(settings: { 'email_routes' => [{ 'inbox_id' => legal.inbox.id, 'senders' => ['nch-ca@gov.example'], 'recipients' => [] }] })
  end

  it 'without rules keeps upstream behaviour: both copies open a ticket in the inbox listed first' do
    deliver(copy_for: care)
    deliver(copy_for: legal)

    expect(care.inbox.conversations.count).to eq(2)
    expect(legal.inbox.conversations.count).to eq(0)
  end

  context 'with rules saved' do
    before { save_routes }

    it 'makes one ticket in the ranked inbox from both copies' do
      deliver(copy_for: care)
      deliver(copy_for: legal)

      expect(care.inbox.conversations.count).to eq(0)
      expect(legal.inbox.conversations.count).to eq(1)
      expect(legal.inbox.conversations.first.messages.incoming.pluck(:content)).to eq(['Please help'])
    end

    it 'moves mail from a listed sender to its inbox although it was sent to care@ only' do
      deliver(copy_for: care, from: 'NCH <nch-ca@gov.example>', cc: nil)

      expect(legal.inbox.conversations.first.contact.email).to eq('nch-ca@gov.example')
      expect(care.inbox.conversations.count).to eq(0)
    end

    it 'keeps a different mail that reuses a Message-ID (a broken sender) as its own ticket' do
      deliver(copy_for: legal)
      deliver(copy_for: legal, subject: 'Another complaint')

      expect(legal.inbox.conversations.count).to eq(2)
    end

    it 'still opens a ticket per mail when the same customer writes twice' do
      deliver(copy_for: care)
      deliver(copy_for: care, message_id: 'complaint-2@mail.example.net')

      expect(legal.inbox.conversations.count).to eq(2)
    end

    it 'keeps a reply in its ticket even when it now has legal@ in Cc' do
      contact = create(:contact, account: account, email: 'customer@example.net')
      ticket = create(:conversation, account: account, inbox: care.inbox, contact: contact)
      create(:message, conversation: ticket, account: account, inbox: care.inbox, message_type: :outgoing, content: 'We are checking')

      deliver(copy_for: legal, to: "reply+#{ticket.uuid}@#{account.inbound_email_domain}", message_id: 'reply-1@mail.example.net')

      expect(ticket.reload.messages.incoming.pluck(:content)).to eq(['Please help'])
      expect(legal.inbox.conversations.count).to eq(0)
    end
  end
end
