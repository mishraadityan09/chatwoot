require 'rails_helper'

# FlightsMojo (FM-41): Settings → Email Routing
RSpec.describe 'Email routes API', type: :request do
  let(:account) { create(:account) }
  let(:administrator) { create(:user, account: account, role: :administrator, name: 'Harsh') }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:legal) { create(:channel_email, account: account, email: 'legal@example.com') }
  let(:base_url) { "/api/v1/accounts/#{account.id}/email_routes" }
  let(:rules) { [{ inbox_id: legal.inbox.id, senders: ['NCH-CA@gov.example'], recipients: ['@gov.example'] }] }

  before { create(:channel_email, account: account, email: 'care@example.com') }

  it 'is refused to agents' do
    get base_url, headers: agent.create_new_auth_token, as: :json
    expect(response).to have_http_status(:unauthorized)

    put base_url, params: { rules: rules }, headers: agent.create_new_auth_token, as: :json
    expect(response).to have_http_status(:unauthorized)
    expect(account.reload.settings['email_routes']).to be_nil
  end

  it 'lists the saved rules and the email inboxes for administrators' do
    legal
    create(:inbox, account: account)

    get base_url, headers: administrator.create_new_auth_token, as: :json

    expect(response).to have_http_status(:success)
    expect(response.parsed_body['rules']).to eq([])
    expect(response.parsed_body['inboxes'].pluck('email')).to contain_exactly('care@example.com', 'legal@example.com')
    expect(response.parsed_body['inboxes'].find { |inbox| inbox['id'] == legal.inbox.id }['members']).to eq(0)
  end

  it 'saves the rules in order and records who changed them' do
    put base_url, params: { rules: rules }, headers: administrator.create_new_auth_token, as: :json

    expect(response).to have_http_status(:success)
    expect(response.parsed_body['rules'])
      .to eq([{ 'inbox_id' => legal.inbox.id, 'senders' => ['nch-ca@gov.example'], 'recipients' => ['@gov.example'] }])
    expect(response.parsed_body['changed']).to include('by' => 'Harsh')
  end

  it 'clears the rules when an empty list is saved' do
    account.update!(settings: { 'email_routes' => [{ 'inbox_id' => legal.inbox.id, 'senders' => [], 'recipients' => [] }] })

    put base_url, params: { rules: [] }, headers: administrator.create_new_auth_token, as: :json

    expect(response).to have_http_status(:success)
    expect(account.reload.settings['email_routes']).to eq([])
  end

  it 'refuses a missing or non-list rules value instead of wiping the saved rules' do
    account.update!(settings: { 'email_routes' => [{ 'inbox_id' => legal.inbox.id, 'senders' => [], 'recipients' => [] }] })

    [{}, { rules: 'oops' }, { rules: { inbox_id: legal.inbox.id } }].each do |body|
      put base_url, params: body, headers: administrator.create_new_auth_token, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end
    expect(account.reload.settings['email_routes'].size).to eq(1)
  end

  it 'refuses invalid entries and keeps what was saved' do
    put base_url, params: { rules: [{ inbox_id: legal.inbox.id, senders: ['not-an-address'] }] },
                  headers: administrator.create_new_auth_token, as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(response.parsed_body['errors'].first).to include('not-an-address')
    expect(account.reload.settings['email_routes']).to be_nil
  end

  it 'checks against the saved rules when the request sends none' do
    account.update!(settings: { 'email_routes' => [{ 'inbox_id' => legal.inbox.id, 'senders' => ['nch-ca@gov.example'], 'recipients' => [] }] })

    post "#{base_url}/check", params: { from: 'NCH Desk <NCH-CA@GOV.EXAMPLE>', to: 'Care <CARE@example.com>' },
                              headers: administrator.create_new_auth_token, as: :json

    expect(response.parsed_body).to include('result' => 'sender', 'entry' => 'nch-ca@gov.example')
  end

  it 'checks a mail against the rules on screen without saving them' do
    post "#{base_url}/check", params: { rules: rules, from: 'nch-ca@gov.example', to: 'care@example.com' },
                              headers: administrator.create_new_auth_token, as: :json

    expect(response).to have_http_status(:success)
    expect(response.parsed_body).to include('result' => 'sender', 'entry' => 'nch-ca@gov.example',
                                            'inbox' => { 'id' => legal.inbox.id, 'name' => legal.inbox.name })
    expect(account.reload.settings['email_routes']).to be_nil
  end
end
