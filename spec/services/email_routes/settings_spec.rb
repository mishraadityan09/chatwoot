require 'rails_helper'

# FlightsMojo (FM-41): Settings → Email Routing
RSpec.describe EmailRoutes::Settings do
  let(:account) { create(:account) }
  let!(:care) { create(:channel_email, account: account, email: 'care@example.com') }
  let!(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }
  let!(:disputes) { create(:channel_email, account: account, email: 'disputes@example.com') }

  describe '.sanitize' do
    it 'keeps the order, lower-cases and de-duplicates entries' do
      input = [{ inbox_id: legal.inbox.id.to_s, senders: [' NCH-CA@gov.example ', 'nch-ca@gov.example'], recipients: ['@Gov.Example'] },
               { 'inbox_id' => disputes.inbox.id }]
      rules, errors = described_class.sanitize(account, input)

      expect(errors).to eq([])
      expect(rules).to eq([{ 'inbox_id' => legal.inbox.id, 'senders' => ['nch-ca@gov.example'], 'recipients' => ['@gov.example'] },
                           { 'inbox_id' => disputes.inbox.id, 'senders' => [], 'recipients' => [] }])
    end

    it 'reports bad entries, repeated inboxes and inboxes that are not email inboxes of the account' do
      api_inbox = create(:inbox, account: account)
      input = [{ inbox_id: legal.inbox.id, senders: ['not-an-address', '@localhost'] }, { inbox_id: legal.inbox.id },
               { inbox_id: api_inbox.id }, { inbox_id: 0 }]
      _, errors = described_class.sanitize(account, input)

      expect(errors.size).to eq(5)
      expect(errors.first).to include('not-an-address')
    end
  end

  describe 'limits' do
    it 'refuses more than 20 inboxes or more than 200 entries in one list' do
      many = (1..21).map { |n| create(:channel_email, account: account, email: "box#{n}@example.com").inbox }
      _, errors = described_class.sanitize(account, many.map { |inbox| { inbox_id: inbox.id } })
      expect(errors).to include('At most 20 inboxes can be listed')

      senders = (1..201).map { |n| "s#{n}@example.com" }
      _, errors = described_class.sanitize(account, [{ inbox_id: legal.inbox.id, senders: senders }])
      expect(errors).to eq(['At most 200 addresses per list'])
    end
  end

  describe '.save! and .check' do
    let(:admin) { create(:user, account: account, role: :administrator, name: 'Harsh') }

    it 'stores the rules with who changed them and when' do
      described_class.save!(account, [{ 'inbox_id' => legal.inbox.id, 'senders' => [], 'recipients' => [] }], user: admin)

      expect(account.reload.settings['email_routes'].first['inbox_id']).to eq(legal.inbox.id)
      expect(account.settings['email_routes_changed']).to include('by' => 'Harsh', 'user_id' => admin.id)
      expect(EmailRoutes.enabled?(account)).to be(true)
    end

    it 'says where a mail would go and why, without saving anything' do
      rules = [{ 'inbox_id' => legal.inbox.id, 'senders' => ['nch-ca@gov.example'], 'recipients' => ['@gov.example'] }]
      check = ->(from, to) { described_class.check(account, rules: rules, from: from, to: to) }
      legal_json = { id: legal.inbox.id, name: legal.inbox.name }

      expect(check.call('nch-ca@gov.example', 'care@example.com')).to include(result: 'sender', entry: 'nch-ca@gov.example')
      expect(check.call('x@example.net', 'care@example.com, legal@example.com')).to include(result: 'address', inbox: legal_json)
      expect(check.call('x@example.net', 'care@example.com, pgo@aviation.gov.example')).to include(result: 'recipient', entry: '@gov.example')
      expect(check.call('x@example.net', 'care@example.com')).to include(result: 'default', inbox: { id: care.inbox.id, name: care.inbox.name })
      expect(check.call('x@example.net', 'someone@example.org')).to eq(result: 'refused')
      expect(account.reload.settings['email_routes']).to be_nil
    end
  end
end
