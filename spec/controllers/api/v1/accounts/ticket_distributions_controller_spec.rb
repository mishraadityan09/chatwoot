require 'rails_helper'

RSpec.describe 'Ticket distribution API', type: :request do
  let(:account) { create(:account) }
  let(:administrator) { create(:user, account: account, role: :administrator, name: 'Harsh', display_name: 'Harsh') }
  let(:agent_a) { create(:user, account: account, role: :agent, name: 'Anmol', display_name: 'Anmol') }
  let(:agent_b) { create(:user, account: account, role: :agent, name: 'Bina', display_name: 'Bina') }
  let(:absent_agent) { create(:user, account: account, role: :agent, name: 'Zed', display_name: 'Zed') }
  let(:inbox) { create(:inbox, account: account, enable_auto_assignment: true) }
  let(:base_url) { "/api/v1/accounts/#{account.id}/ticket_distribution" }

  before do
    create(:inbox_member, user: agent_a, inbox: inbox)
    create(:inbox_member, user: agent_b, inbox: inbox)
    create(:inbox_member, user: absent_agent, inbox: inbox)
  end

  def preview(params = {})
    post "#{base_url}/preview",
         params: { agent_ids: [agent_a.id, agent_b.id], inbox_ids: [inbox.id] }.merge(params),
         headers: administrator.create_new_auth_token, as: :json
  end

  describe 'GET /ticket_distribution' do
    it 'is refused to agents' do
      get base_url, headers: agent_a.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it 'lists agents, inboxes and teams for administrators' do
      create(:conversation, account: account, inbox: inbox, assignee: absent_agent)

      get base_url, headers: administrator.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      body = response.parsed_body
      expect(body['agents'].find { |agent| agent['id'] == absent_agent.id }).to include('open_count' => 1, 'role' => 'agent')
      expect(body['inboxes'].find { |row| row['id'] == inbox.id }['member_ids']).to contain_exactly(agent_a.id, agent_b.id, absent_agent.id)
      expect(body['teams']).to eq([])
    end
  end

  describe 'POST /ticket_distribution/preview' do
    let!(:held) { create_list(:conversation, 4, account: account, inbox: inbox, assignee: absent_agent, status: :open) }

    before do
      create_list(:conversation, 2, account: account, inbox: inbox, status: :open)
      create(:conversation, account: account, inbox: inbox, assignee: absent_agent, status: :resolved)
      create(:conversation, account: account, inbox: inbox, status: :pending)
    end

    it 'is refused to agents' do
      post "#{base_url}/preview", params: { agent_ids: [agent_a.id] }, headers: agent_a.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it 'shows an equal split of the open tickets' do
      preview

      expect(response).to have_http_status(:success)
      body = response.parsed_body
      expect(body).to include('ticket_count' => 6, 'moving' => 6, 'unassigned_before' => 2, 'auto_assignment_inbox_ids' => [inbox.id])
      expect(body['agents'].map { |row| [row['name'], row['after']] }).to eq([['Anmol', 3], ['Bina', 3]])
      expect(body['others']).to include(include('id' => absent_agent.id, 'before' => 4, 'after' => 0, 'outgoing' => 4))
    end

    it 'changes nothing and keeps the moves on the server' do
      preview

      expect(response.parsed_body['token']).to be_present
      expect(response.parsed_body).not_to have_key('moves')
      expect(held.map { |conversation| conversation.reload.assignee_id }.uniq).to eq([absent_agent.id])
    end

    it 'includes snoozed tickets only when asked' do
      create(:conversation, account: account, inbox: inbox, status: :snoozed)

      preview
      expect(response.parsed_body['ticket_count']).to eq(6)

      preview(include_snoozed: true)
      expect(response.parsed_body['ticket_count']).to eq(7)
    end

    it 'reports tickets none of the picked agents can open' do
      other_inbox = create(:inbox, account: account)
      create(:conversation, account: account, inbox: other_inbox, status: :open)

      preview(inbox_ids: [])

      expect(response.parsed_body['unplaceable']).to eq([{ 'inbox_id' => other_inbox.id, 'inbox_name' => other_inbox.name, 'count' => 1 }])
    end

    it 'tells which picked agents cannot open any of the tickets' do
      outsider = create(:user, account: account, role: :agent, name: 'Olga', display_name: 'Olga')

      preview(agent_ids: [agent_a.id, outsider.id])

      rows = response.parsed_body['agents'].index_by { |row| row['name'] }
      expect(rows['Anmol']).to include('can_take' => 6, 'after' => 6)
      expect(rows['Olga']).to include('can_take' => 0, 'after' => 0)
    end

    it 'needs at least one agent from this account' do
      preview(agent_ids: [])
      expect(response).to have_http_status(:unprocessable_entity)

      preview(agent_ids: [create(:user).id])
      expect(response).to have_http_status(:unprocessable_entity)
    end
  end

  describe 'POST /ticket_distribution' do
    before { create_list(:conversation, 2, account: account, inbox: inbox, status: :open) }

    it 'queues the previewed moves once and can switch auto-assignment off' do
      preview
      token = response.parsed_body['token']

      expect do
        post base_url, params: { token: token, turn_off_auto_assignment: true }, headers: administrator.create_new_auth_token, as: :json
      end.to have_enqueued_job(TicketDistribution::ApplyJob)

      expect(response).to have_http_status(:success)
      expect(response.parsed_body).to include('total' => 2, 'auto_assignment_turned_off' => [inbox.id])
      expect(inbox.reload.enable_auto_assignment).to be(false)

      get "#{base_url}/status", params: { token: token }, headers: administrator.create_new_auth_token
      expect(response.parsed_body).to include('state' => 'queued', 'total' => 2)

      post base_url, params: { token: token }, headers: administrator.create_new_auth_token, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'leaves auto-assignment alone unless asked' do
      preview
      post base_url, params: { token: response.parsed_body['token'] }, headers: administrator.create_new_auth_token, as: :json

      expect(inbox.reload.enable_auto_assignment).to be(true)
    end

    it 'does not let another administrator use the preview' do
      preview
      token = response.parsed_body['token']
      other_admin = create(:user, account: account, role: :administrator)

      post base_url, params: { token: token }, headers: other_admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end
  end
end
