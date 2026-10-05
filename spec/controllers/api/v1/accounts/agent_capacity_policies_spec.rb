# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: Settings → Agent Assignment → Agent capacity.
RSpec.describe 'Agent capacity policies API', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:base) { "/api/v1/accounts/#{account.id}/agent_capacity_policies" }

  describe 'GET /agent_capacity_policies' do
    it 'needs a signed-in user' do
      get base

      expect(response).to have_http_status(:unauthorized)
    end

    it 'is closed to agents' do
      get base, headers: agent.create_new_auth_token, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it 'lists the account policies with their limits and agent count' do
      policy = AgentCapacityPolicy.create!(account: account, name: 'Max 5')
      inbox = create(:inbox, account: account)
      limit = InboxCapacityLimit.create!(agent_capacity_policy: policy, inbox: inbox, conversation_limit: 5)
      account.account_users.find_by(user_id: agent.id).update!(agent_capacity_policy: policy)
      AgentCapacityPolicy.create!(account: create(:account), name: 'Other account')

      get base, headers: admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:success)
      body = response.parsed_body
      expect(body.pluck('name')).to eq(['Max 5'])
      expect(body.first['assigned_agent_count']).to eq(1)
      expect(body.first['inbox_capacity_limits']).to eq(
        [{ 'id' => limit.id, 'inbox_id' => inbox.id, 'conversation_limit' => 5, 'agent_capacity_policy_id' => policy.id }]
      )
    end
  end

  describe 'POST, PATCH and DELETE /agent_capacity_policies' do
    it 'creates, updates and deletes a policy' do
      post base, headers: admin.create_new_auth_token, as: :json,
                 params: { name: 'Max 8', description: 'Chat teams',
                           exclusion_rules: { excluded_labels: ['vip'], exclude_older_than_hours: 72 } }

      expect(response).to have_http_status(:success)
      policy = account.agent_capacity_policies.find(response.parsed_body['id'])
      expect(policy.excluded_labels).to eq(['vip'])
      expect(policy.exclude_older_than_hours).to eq(72)

      patch "#{base}/#{policy.id}", headers: admin.create_new_auth_token, as: :json, params: { name: 'Max 9' }
      expect(policy.reload.name).to eq('Max 9')

      delete "#{base}/#{policy.id}", headers: admin.create_new_auth_token, as: :json
      expect(response).to have_http_status(:success)
      expect(AgentCapacityPolicy.find_by(id: policy.id)).to be_nil
    end

    it 'refuses a policy without a name' do
      post base, headers: admin.create_new_auth_token, as: :json, params: { name: '' }

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it 'does not touch another account\'s policy' do
      other = AgentCapacityPolicy.create!(account: create(:account), name: 'Other')

      delete "#{base}/#{other.id}", headers: admin.create_new_auth_token, as: :json

      expect(response).to have_http_status(:not_found)
      expect(AgentCapacityPolicy.find_by(id: other.id)).to be_present
    end
  end

  describe 'agents of a policy' do
    let(:policy) { AgentCapacityPolicy.create!(account: account, name: 'Max 5') }

    it 'adds, lists and removes an agent' do
      post "#{base}/#{policy.id}/users", headers: admin.create_new_auth_token, as: :json, params: { user_id: agent.id }
      expect(response).to have_http_status(:success)
      expect(response.parsed_body['id']).to eq(agent.id)

      get "#{base}/#{policy.id}/users", headers: admin.create_new_auth_token, as: :json
      expect(response.parsed_body.pluck('id')).to eq([agent.id])

      delete "#{base}/#{policy.id}/users/#{agent.id}", headers: admin.create_new_auth_token, as: :json
      expect(account.account_users.find_by(user_id: agent.id).agent_capacity_policy).to be_nil
    end

    it 'moves an agent from one policy to another' do
      other_policy = AgentCapacityPolicy.create!(account: account, name: 'Max 9')
      account.account_users.find_by(user_id: agent.id).update!(agent_capacity_policy: other_policy)

      post "#{base}/#{policy.id}/users", headers: admin.create_new_auth_token, as: :json, params: { user_id: agent.id }

      expect(account.account_users.find_by(user_id: agent.id).agent_capacity_policy).to eq(policy)
    end

    it 'does not add someone from another account' do
      stranger = create(:user, account: create(:account), role: :agent)

      post "#{base}/#{policy.id}/users", headers: admin.create_new_auth_token, as: :json, params: { user_id: stranger.id }

      expect(response).to have_http_status(:not_found)
    end
  end

  describe 'limits of a policy' do
    let(:policy) { AgentCapacityPolicy.create!(account: account, name: 'Max 5') }
    let(:inbox) { create(:inbox, account: account) }

    it 'adds, changes and removes the limit for an inbox' do
      post "#{base}/#{policy.id}/inbox_limits", headers: admin.create_new_auth_token, as: :json,
                                                params: { inbox_id: inbox.id, conversation_limit: 6 }
      expect(response).to have_http_status(:success)
      limit = policy.inbox_capacity_limits.find(response.parsed_body['id'])
      expect(limit.conversation_limit).to eq(6)

      put "#{base}/#{policy.id}/inbox_limits/#{limit.id}", headers: admin.create_new_auth_token, as: :json,
                                                           params: { conversation_limit: 8 }
      expect(limit.reload.conversation_limit).to eq(8)

      delete "#{base}/#{policy.id}/inbox_limits/#{limit.id}", headers: admin.create_new_auth_token, as: :json
      expect(policy.inbox_capacity_limits).to be_empty
    end

    it 'refuses a second limit for the same inbox, a negative one and another account\'s inbox' do
      policy.inbox_capacity_limits.create!(inbox: inbox, conversation_limit: 3)

      post "#{base}/#{policy.id}/inbox_limits", headers: admin.create_new_auth_token, as: :json,
                                                params: { inbox_id: inbox.id, conversation_limit: 4 }
      expect(response).to have_http_status(:unprocessable_entity)

      other_inbox = create(:inbox, account: account)
      post "#{base}/#{policy.id}/inbox_limits", headers: admin.create_new_auth_token, as: :json,
                                                params: { inbox_id: other_inbox.id, conversation_limit: -1 }
      expect(response).to have_http_status(:unprocessable_entity)

      foreign_inbox = create(:inbox, account: create(:account))
      post "#{base}/#{policy.id}/inbox_limits", headers: admin.create_new_auth_token, as: :json,
                                                params: { inbox_id: foreign_inbox.id, conversation_limit: 2 }
      expect(response).to have_http_status(:not_found)
    end
  end
end
