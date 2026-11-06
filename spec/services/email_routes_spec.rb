require 'rails_helper'

# FlightsMojo (FM-41)
RSpec.describe EmailRoutes do
  let(:account) { create(:account) }
  let!(:care) { create(:channel_email, account: account, email: 'care@example.com') }
  let!(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }
  let!(:disputes) { create(:channel_email, account: account, email: 'disputes@example.com') }

  # route(legal.inbox, [disputes.inbox, { senders: [...] }]) saves the rules in that order.
  def route(*rules)
    stored = rules.map do |rule|
      inbox, lists = Array(rule)
      { 'inbox_id' => inbox.id, 'senders' => lists&.dig(:senders) || [], 'recipients' => lists&.dig(:recipients) || [] }
    end
    account.update!(settings: (account.settings || {}).merge('email_routes' => stored))
    care.reload
  end

  def pick(default: care, original_to: nil, **headers)
    mail = Mail.new(headers)
    mail['X-Original-To'] = original_to if original_to
    described_class.channel_for(mail, default)
  end

  describe '.channel_for' do
    it 'keeps upstream behaviour when no rules are saved or the mail found no inbox' do
      expect(pick(to: 'care@example.com', cc: 'legal@example.com')).to be_nil
      route(legal.inbox)
      expect(pick(to: 'care@example.com', cc: 'legal@example.com', default: nil)).to be_nil
    end

    it 'gives the mail to a listed inbox named in Cc although care@ comes first' do
      route(legal.inbox)
      expect(pick(to: 'care@example.com', cc: 'Legal Desk <LEGAL@example.com>')).to eq(legal)
    end

    it 'lets the inbox listed first win when the mail names two listed inboxes' do
      headers = { to: 'care@example.com', cc: ['legal@example.com', 'disputes@example.com'] }
      route(disputes.inbox, legal.inbox)
      expect(pick(**headers)).to eq(disputes)
      route(legal.inbox, disputes.inbox)
      expect(pick(**headers)).to eq(legal)
    end

    it 'routes by sender, whichever of our addresses the mail went to' do
      route([legal.inbox, { senders: ['nch-ca@gov.example'] }])
      expect(pick(from: 'NCH <nch-ca@gov.example>', to: 'care@example.com')).to eq(legal)
      expect(pick(from: 'customer@example.net', to: 'care@example.com', cc: 'nch-ca@gov.example')).to be_nil
    end

    it 'matches a domain entry and its subdomains, not lookalikes' do
      route([legal.inbox, { senders: ['@gov.example'] }])
      expect(pick(from: 'desk@gov.example', to: 'care@example.com')).to eq(legal)
      expect(pick(from: 'desk@aviation.gov.example', to: 'care@example.com')).to eq(legal)
      expect(pick(from: 'desk@notgov.example', to: 'care@example.com')).to be_nil
    end

    it 'matches recipient entries against To and Cc' do
      route([legal.inbox, { recipients: ['grievance@example.com', '@regulator.example'] }])
      expect(pick(from: 'customer@example.net', to: 'grievance@example.com', cc: 'care@example.com')).to eq(legal)
      expect(pick(from: 'customer@example.net', to: 'care@example.com', cc: 'pgo@regulator.example')).to eq(legal)
      expect(pick(from: 'pgo@regulator.example', to: 'care@example.com')).to be_nil
    end

    it 'recognises the forwarding address Postfix puts in X-Original-To and plus addressing' do
      route(legal.inbox)
      expect(pick(to: 'care@example.com', original_to: legal.forward_to_email)).to eq(legal)
      expect(pick(to: 'care@example.com', cc: 'legal+notice@example.com')).to eq(legal)
      expect(pick(to: 'care@example.com', original_to: care.forward_to_email)).to be_nil
    end

    it 'skips a saved inbox that was deleted or belongs to another account' do
      other = create(:channel_email, email: 'other@example.com')
      account.update!(settings: { 'email_routes' => [{ 'inbox_id' => other.inbox.id, 'senders' => [], 'recipients' => [] },
                                                     { 'inbox_id' => 0, 'senders' => ['nch-ca@gov.example'], 'recipients' => [] }] })
      care.reload
      expect(pick(to: 'care@example.com', cc: 'other@example.com')).to be_nil
      expect(pick(from: 'nch-ca@gov.example', to: 'care@example.com')).to be_nil
    end
  end
end
