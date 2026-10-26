# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo (FM-24): the model-level backstop behind the controller guards.
RSpec.describe RequiredAttributesBeforeResolve do
  let(:account) { create(:account) }
  let(:agent) { create(:user, account: account) }
  let(:conversation) { create(:conversation, account: account) }

  before do
    account.enable_features!('conversation_required_attributes')
    create(:custom_attribute_definition, account: account, attribute_key: 'booking_id', attribute_display_name: 'Booking ID',
                                         attribute_display_type: :text, attribute_model: :conversation_attribute)
    account.update!(settings: account.settings.merge('conversation_required_attributes' => ['booking_id']))
  end

  after { Current.reset }

  it 'does not let a signed-in person resolve while a required attribute is missing' do
    Current.user = agent

    expect(conversation.update(status: :resolved)).to be(false)
    expect(conversation.errors[:base].join).to include('Booking ID')
    expect(conversation.reload).to be_open
  end

  it 'lets the person resolve once the attribute is filled in' do
    Current.user = agent
    conversation.update!(custom_attributes: { 'booking_id' => '48211902' })

    expect(conversation.update(status: :resolved)).to be(true)
  end

  it 'does not stop the system' do
    Current.user = nil

    expect(conversation.update(status: :resolved)).to be(true)
  end

  it 'does not stop a bot' do
    Current.user = create(:agent_bot, account: account)

    expect(conversation.update(status: :resolved)).to be(true)
  end

  it 'does not get in the way of other changes to a conversation that is already resolved' do
    conversation.update!(status: :resolved)
    Current.user = agent

    expect(conversation.update(priority: :high)).to be(true)
  end
end
