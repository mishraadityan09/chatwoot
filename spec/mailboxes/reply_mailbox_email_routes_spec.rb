require 'rails_helper'

# FlightsMojo (FM-41): a new mail goes to the inbox FM_EMAIL_ROUTES ranks first, and only once,
# even when two of our mailboxes forward it.
RSpec.describe ReplyMailbox do
  include ActionMailbox::TestHelper

  let(:account) { create(:account) }
  let(:care) { create(:channel_email, account: account, email: 'care@example.com') }
  let(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }
  let(:routes) { "#{legal.inbox.id}:nch-ca@gov.example" }

  # One forwarded copy, as Postfix hands it over: X-Original-To = the forwarding address it came to.
  def deliver(copy_for:, from: 'customer@example.net', to: 'care@example.com', cc: 'legal@example.com', message_id: 'complaint-1@mail.example.net')
    mail = Mail.new(from: from, to: to, cc: cc, subject: 'Refund not received', body: 'Please help', message_id: "<#{message_id}>")
    mail['X-Original-To'] = copy_for.forward_to_email
    described_class.receive(create_inbound_email_from_source(mail.to_s))
  end

  def with_routes(&)
    with_modified_env('FM_EMAIL_ROUTES' => routes, &)
  end

  it 'without the setting keeps upstream behaviour: both copies open a ticket in the inbox listed first' do
    with_modified_env('FM_EMAIL_ROUTES' => nil) do
      deliver(copy_for: care)
      deliver(copy_for: legal)
    end

    expect(care.inbox.conversations.count).to eq(2)
    expect(legal.inbox.conversations.count).to eq(0)
  end

  it 'with the setting makes one ticket in the ranked inbox from both copies' do
    with_routes do
      deliver(copy_for: care)
      deliver(copy_for: legal)
    end

    expect(care.inbox.conversations.count).to eq(0)
    expect(legal.inbox.conversations.count).to eq(1)
    expect(legal.inbox.conversations.first.messages.incoming.pluck(:content)).to eq(['Please help'])
  end

  it 'moves mail from a listed sender to its inbox although it was sent to care@ only' do
    with_routes { deliver(copy_for: care, from: 'NCH <nch-ca@gov.example>', cc: nil) }

    expect(legal.inbox.conversations.first.contact.email).to eq('nch-ca@gov.example')
    expect(care.inbox.conversations.count).to eq(0)
  end

  it 'still opens a ticket per mail when the same customer writes twice' do
    with_routes do
      deliver(copy_for: care)
      deliver(copy_for: care, message_id: 'complaint-2@mail.example.net')
    end

    expect(legal.inbox.conversations.count).to eq(2)
  end

  it 'keeps a reply in its ticket even when it now has legal@ in Cc' do
    contact = create(:contact, account: account, email: 'customer@example.net')
    ticket = create(:conversation, account: account, inbox: care.inbox, contact: contact)
    create(:message, conversation: ticket, account: account, inbox: care.inbox, message_type: :outgoing, content: 'We are checking')

    with_routes { deliver(copy_for: legal, to: "reply+#{ticket.uuid}@#{account.inbound_email_domain}", message_id: 'reply-1@mail.example.net') }

    expect(ticket.reload.messages.incoming.pluck(:content)).to eq(['Please help'])
    expect(legal.inbox.conversations.count).to eq(0)
  end
end
