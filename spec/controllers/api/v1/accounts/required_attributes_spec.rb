# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: administrators choose the attributes required before resolving
# (Settings → Conversation Workflow); resolving without them is refused.
RSpec.describe 'Required conversation attributes', type: :request do
  let(:account) { create(:account) }
  let(:admin) { create(:user, account: account, role: :administrator) }
  let(:agent) { create(:user, account: account, role: :agent) }
  let(:conversation) { create(:conversation, account: account) }
  let!(:booking_attribute) do
    create(:custom_attribute_definition, account: account, attribute_key: 'booking_id',
                                         attribute_display_type: :text, attribute_model: :conversation_attribute)
  end

  before { account.enable_features!('conversation_required_attributes') }

  describe 'PATCH /api/v1/accounts/{account.id}' do
    it 'saves the required attributes and drops keys that are not conversation attributes' do
      patch "/api/v1/accounts/#{account.id}",
            params: { conversation_required_attributes: %w[booking_id nope] },
            headers: admin.create_new_auth_token,
            as: :json

      expect(response).to have_http_status(:success)
      expect(account.reload.settings['conversation_required_attributes']).to eq(['booking_id'])
    end

    it 'does not let an agent change it' do
      patch "/api/v1/accounts/#{account.id}",
            params: { conversation_required_attributes: ['booking_id'] },
            headers: agent.create_new_auth_token,
            as: :json

      expect(response).to have_http_status(:unauthorized)
      expect(account.reload.settings['conversation_required_attributes']).to be_blank
    end
  end

  describe 'POST /api/v1/accounts/{account.id}/conversations/:id/toggle_status' do
    before do
      create(:inbox_member, user: agent, inbox: conversation.inbox)
      account.update!(settings: account.settings.merge('conversation_required_attributes' => ['booking_id']))
    end

    def toggle(status, user: agent)
      post "/api/v1/accounts/#{account.id}/conversations/#{conversation.display_id}/toggle_status",
           headers: user.create_new_auth_token, params: { status: status }, as: :json
    end

    it 'refuses to resolve while a required attribute is missing' do
      toggle('resolved')

      expect(response).to have_http_status(:unprocessable_entity)
      expect(response.parsed_body['missing_attributes']).to eq(['booking_id'])
      expect(response.parsed_body['error']).to include(booking_attribute.attribute_display_name)
      expect(conversation.reload.status).to eq('open')
    end

    it 'refuses the status flip as well (no status given)' do
      toggle('')

      expect(response).to have_http_status(:unprocessable_entity)
      expect(conversation.reload.status).to eq('open')
    end

    it 'resolves once the attribute is filled' do
      conversation.update!(custom_attributes: { 'booking_id' => '48211902' })

      toggle('resolved')

      expect(response).to have_http_status(:success)
      expect(conversation.reload.status).to eq('resolved')
    end

    it 'still lets anyone reopen or snooze' do
      conversation.update!(status: :resolved)

      toggle('open')

      expect(response).to have_http_status(:success)
      expect(conversation.reload.status).to eq('open')
    end

    it 'does not check anything when the feature is off' do
      account.disable_features!('conversation_required_attributes')

      toggle('resolved')

      expect(response).to have_http_status(:success)
      expect(conversation.reload.status).to eq('resolved')
    end

    it 'does not stop an agent bot from resolving' do
      agent_bot = create(:agent_bot, account: account)
      create(:agent_bot_inbox, agent_bot: agent_bot, inbox: conversation.inbox)

      post "/api/v1/accounts/#{account.id}/conversations/#{conversation.display_id}/toggle_status",
           headers: { api_access_token: agent_bot.access_token.token }, params: { status: 'resolved' }, as: :json

      expect(response).to have_http_status(:success)
      expect(conversation.reload.status).to eq('resolved')
    end
  end
end
