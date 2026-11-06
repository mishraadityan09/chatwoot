require 'rails_helper'

# FlightsMojo (FM-40)
RSpec.describe OutlookMirror do
  let(:account) { create(:account) }
  let(:email_channel) { create(:channel_email, account: account, email: 'agency@example.com') }
  let(:inbox) { email_channel.inbox }

  describe '.addresses_for' do
    it 'is empty when the setting is not set' do
      expect(described_class.addresses_for(inbox)).to eq([])
    end

    it 'returns the addresses configured for this inbox only' do
      with_modified_env 'FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com, 999999:other@example.com,#{inbox.id}:ops@example.com" do
        expect(described_class.addresses_for(inbox)).to eq(%w[agency@example.com ops@example.com])
      end
    end

    it 'ignores malformed pairs and inboxes that are not email inboxes' do
      api_inbox = create(:inbox, account: account)
      value = "agency@example.com #{inbox.id}:not-an-address {\"#{inbox.id}\":\"x@example.com\"} #{api_inbox.id}:y@example.com"
      with_modified_env 'FM_OUTLOOK_MIRROR' => value do
        expect(described_class.addresses_for(inbox)).to eq([])
        expect(described_class.addresses_for(api_inbox)).to eq([])
      end
    end
  end

  describe '.add_cc!' do
    let(:options) { { to: ['supplier@example.com'], cc: ['ops@example.com'], bcc: nil } }

    it 'leaves the options untouched when the inbox has no mirror' do
      options = { to: ['supplier@example.com'] }
      described_class.add_cc!(options, inbox)
      expect(options).to eq(to: ['supplier@example.com'])
    end

    it 'adds the mirror address after the Cc the agent chose' do
      with_modified_env 'FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com" do
        described_class.add_cc!(options, inbox)
      end
      expect(options[:cc]).to eq(%w[ops@example.com agency@example.com])
    end

    it 'does not add an address that is already a recipient, whatever its case or display name' do
      with_modified_env 'FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com" do
        [{ to: ['Agency Desk <AGENCY@example.com>'] }, { to: ['s@example.com'], cc: 'x@example.com, Agency@Example.com' },
         { to: ['s@example.com'], bcc: ['agency@example.com'] }].each do |given|
          expect { described_class.add_cc!(given, inbox) }.not_to(change { given.dup })
        end
      end
    end
  end

  describe '.remember_sent_cc' do
    let(:message) do
      create(:message, account: account, message_type: :outgoing, content_attributes: { cc_emails: ['ops@example.com'] })
    end

    it 'adds the Cc addresses that went out but were not stored' do
      described_class.remember_sent_cc(message, Mail.new(cc: ['ops@example.com', 'agency@example.com']))
      message.save!
      expect(message.reload.content_attributes[:cc_emails]).to eq(%w[ops@example.com agency@example.com])
    end

    it 'changes nothing when the mail had no other Cc' do
      described_class.remember_sent_cc(message, Mail.new(cc: ['OPS@example.com']))
      expect(message.changed?).to be(false)
    end

    it 'copes with a mailer that sent nothing' do
      expect { described_class.remember_sent_cc(message, nil) }.not_to raise_error
    end
  end

  describe '.message_attributes' do
    let(:conversation) { create(:conversation, account: account, inbox: inbox) }
    let(:attributes) { { sender: conversation.contact, message_type: 'incoming', content_type: 'incoming_email', content: 'We rebooked them' } }
    let(:desk_mail) do
      Mail.new(from: 'Agency <agency@example.com>', to: ["reply+#{conversation.uuid}@inbound.example.com", 'supplier@example.com'],
               cc: ['agency@example.com', 'ops@example.com'])
    end

    before { create(:message, conversation: conversation, account: account, inbox: inbox, message_type: :incoming) }

    it 'turns a reply written in Outlook from the mirror address into a private note' do
      result = with_modified_env('FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com") do
        described_class.message_attributes(attributes, conversation: conversation, mail: MailPresenter.new(desk_mail))
      end

      expect(result).to include(sender: nil, message_type: 'outgoing', private: true, content_type: 'text')
      expect(result[:content]).to eq("Sent from Outlook by agency@example.com · to supplier@example.com · cc ops@example.com\n\nWe rebooked them")
    end

    it 'keeps mail from anyone else as a message from the contact' do
      supplier_mail = Mail.new(from: 'supplier@example.com', to: ["reply+#{conversation.uuid}@inbound.example.com"], cc: ['agency@example.com'])
      result = with_modified_env('FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com") do
        described_class.message_attributes(attributes, conversation: conversation, mail: MailPresenter.new(supplier_mail))
      end

      expect(result).to eq(attributes)
    end

    it 'keeps the mail as it is when the inbox has no mirror or the conversation is new' do
      expect(described_class.message_attributes(attributes, conversation: conversation, mail: MailPresenter.new(desk_mail))).to eq(attributes)

      fresh = create(:conversation, account: account, inbox: inbox)
      result = with_modified_env('FM_OUTLOOK_MIRROR' => "#{inbox.id}:agency@example.com") do
        described_class.message_attributes(attributes, conversation: fresh, mail: MailPresenter.new(desk_mail))
      end
      expect(result).to eq(attributes)
    end
  end
end
