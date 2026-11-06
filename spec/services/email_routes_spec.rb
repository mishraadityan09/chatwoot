require 'rails_helper'

# FlightsMojo (FM-41)
RSpec.describe EmailRoutes do
  let(:account) { create(:account) }
  let!(:care) { create(:channel_email, account: account, email: 'care@example.com') }
  let!(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }
  let!(:disputes) { create(:channel_email, account: account, email: 'disputes@example.com') }

  def with_routes(value, &)
    with_modified_env(described_class::ENV_KEY => value, &)
  end

  def pick(default: care, original_to: nil, **headers)
    mail = Mail.new(headers)
    mail['X-Original-To'] = original_to if original_to
    described_class.channel_for(mail, default)
  end

  describe '.enabled?' do
    it 'is off when the setting is missing or blank' do
      with_routes(nil) { expect(described_class.enabled?).to be(false) }
      with_routes(' ') { expect(described_class.enabled?).to be(false) }
      with_routes(legal.inbox.id.to_s) { expect(described_class.enabled?).to be(true) }
    end
  end

  describe '.parse' do
    it 'reads the inboxes in order with their senders, domains and to: entries, whatever the separators' do
      value = "#{legal.inbox.id}:NCH-CA@gov.example, @Courts.example ; to:Grievance@example.com #{disputes.inbox.id}"
      with_routes(value) do
        expect(described_class.parse).to eq([[legal.inbox.id, %w[nch-ca@gov.example @courts.example], ['grievance@example.com']],
                                             [disputes.inbox.id, [], []]])
      end
    end

    it 'ignores malformed entries and logs why' do
      allow(Rails.logger).to receive(:warn)
      with_routes("stray@example.com #{legal.inbox.id}:not-an-address,to:nope,@localhost") do
        expect(described_class.parse).to eq([[legal.inbox.id, [], []]])
      end
      expect(Rails.logger).to have_received(:warn).with(/\[FM-41\]/).exactly(4).times
    end
  end

  describe '.channel_for' do
    it 'keeps upstream behaviour when the setting is missing or the mail found no inbox' do
      with_routes(nil) { expect(pick(to: 'care@example.com', cc: 'legal@example.com')).to be_nil }
      with_routes(legal.inbox.id.to_s) do
        expect(pick(to: 'care@example.com', cc: 'legal@example.com', default: nil)).to be_nil
      end
    end

    it 'gives the mail to a listed inbox named in Cc although care@ comes first' do
      with_routes(legal.inbox.id.to_s) { expect(pick(to: 'care@example.com', cc: 'Legal Desk <LEGAL@example.com>')).to eq(legal) }
    end

    it 'lets the inbox listed first win when the mail names two listed inboxes' do
      headers = { to: 'care@example.com', cc: ['legal@example.com', 'disputes@example.com'] }
      with_routes("#{disputes.inbox.id} #{legal.inbox.id}") { expect(pick(**headers)).to eq(disputes) }
      with_routes("#{legal.inbox.id} #{disputes.inbox.id}") { expect(pick(**headers)).to eq(legal) }
    end

    it 'routes by sender, whichever of our addresses the mail went to' do
      with_routes("#{legal.inbox.id}:nch-ca@gov.example") do
        expect(pick(from: 'NCH <nch-ca@gov.example>', to: 'care@example.com')).to eq(legal)
        expect(pick(from: 'customer@example.net', to: 'care@example.com', cc: 'nch-ca@gov.example')).to be_nil
      end
    end

    it 'matches a domain entry and its subdomains, not lookalikes' do
      with_routes("#{legal.inbox.id}:@gov.example") do
        expect(pick(from: 'desk@gov.example', to: 'care@example.com')).to eq(legal)
        expect(pick(from: 'desk@aviation.gov.example', to: 'care@example.com')).to eq(legal)
        expect(pick(from: 'desk@notgov.example', to: 'care@example.com')).to be_nil
      end
    end

    it 'matches to: entries against To and Cc' do
      with_routes("#{legal.inbox.id}:to:grievance@example.com,to:@regulator.example") do
        expect(pick(from: 'customer@example.net', to: 'grievance@example.com', cc: 'care@example.com')).to eq(legal)
        expect(pick(from: 'customer@example.net', to: 'care@example.com', cc: 'pgo@regulator.example')).to eq(legal)
        expect(pick(from: 'pgo@regulator.example', to: 'care@example.com')).to be_nil
      end
    end

    it 'recognises the forwarding address Postfix puts in X-Original-To and plus addressing' do
      with_routes(legal.inbox.id.to_s) do
        expect(pick(to: 'care@example.com', original_to: legal.forward_to_email)).to eq(legal)
        expect(pick(to: 'care@example.com', cc: 'legal+notice@example.com')).to eq(legal)
        expect(pick(to: 'care@example.com', original_to: care.forward_to_email)).to be_nil
      end
    end

    it 'skips inboxes of another account and inboxes that are not email inboxes' do
      other = create(:channel_email, email: 'other@example.com')
      api_inbox = create(:inbox, account: account)
      with_routes("#{other.inbox.id} #{api_inbox.id}:nch-ca@gov.example") do
        expect(pick(to: 'care@example.com', cc: 'other@example.com')).to be_nil
        expect(pick(from: 'nch-ca@gov.example', to: 'care@example.com')).to be_nil
      end
    end
  end
end
