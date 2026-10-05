# frozen_string_literal: true

require 'rails_helper'

# FlightsMojo: attributes an agent must fill in before resolving a conversation.
RSpec.describe Conversations::RequiredAttributesService do
  let(:account) { create(:account) }
  let(:conversation) { create(:conversation, account: account, custom_attributes: custom_attributes) }
  let(:custom_attributes) { {} }
  let(:service) { described_class.new(account) }

  def define_attribute(key, display_type: :text, **extra)
    create(:custom_attribute_definition, account: account, attribute_key: key, attribute_display_type: display_type,
                                         attribute_model: :conversation_attribute, **extra)
  end

  def require_attributes(*keys)
    account.update!(settings: account.settings.merge('conversation_required_attributes' => keys))
  end

  context 'when the feature is off' do
    before do
      define_attribute('booking_id')
      require_attributes('booking_id')
    end

    it 'requires nothing' do
      expect(service.required_keys).to eq([])
      expect(service.missing_keys(conversation)).to eq([])
    end
  end

  context 'when the feature is on' do
    before { account.enable_features!('conversation_required_attributes') }

    it 'reports a required attribute that has no value' do
      define_attribute('booking_id')
      require_attributes('booking_id')

      expect(service.missing_keys(conversation)).to eq(['booking_id'])
    end

    context 'with a value' do
      let(:custom_attributes) { { 'booking_id' => ' 4821 ' } }

      it 'does not report it' do
        define_attribute('booking_id')
        require_attributes('booking_id')

        expect(service.missing_keys(conversation)).to eq([])
      end
    end

    context 'with a blank value' do
      let(:custom_attributes) { { 'booking_id' => '   ' } }

      it 'reports it' do
        define_attribute('booking_id')
        require_attributes('booking_id')

        expect(service.missing_keys(conversation)).to eq(['booking_id'])
      end
    end

    it 'ignores required keys that are no longer defined' do
      require_attributes('deleted_attribute')

      expect(service.required_keys).to eq([])
      expect(service.missing_keys(conversation)).to eq([])
    end

    context 'with a pattern' do
      before do
        define_attribute('booking_id', regex_pattern: '/^\d{1,10}$/')
        require_attributes('booking_id')
      end

      it 'accepts a value that matches' do
        conversation.update!(custom_attributes: { 'booking_id' => '48211902' })

        expect(service.missing_keys(conversation)).to eq([])
      end

      it 'reports a value that breaks the pattern' do
        conversation.update!(custom_attributes: { 'booking_id' => 'AB12CD' })

        expect(service.missing_keys(conversation)).to eq(['booking_id'])
      end
    end

    it 'does not block when the pattern itself is broken' do
      define_attribute('booking_id', regex_pattern: '/(/')
      require_attributes('booking_id')
      conversation.update!(custom_attributes: { 'booking_id' => 'AB12CD' })

      expect(service.missing_keys(conversation)).to eq([])
    end

    context 'with a checkbox' do
      it 'is filled once true or false was chosen' do
        define_attribute('urgent', display_type: :checkbox)
        require_attributes('urgent')

        expect(service.missing_keys(conversation)).to eq(['urgent'])
        conversation.update!(custom_attributes: { 'urgent' => false })
        expect(service.missing_keys(conversation)).to eq([])
      end
    end

    describe '#sanitize' do
      it 'keeps only existing conversation attribute keys, once each' do
        define_attribute('booking_id')
        create(:custom_attribute_definition, account: account, attribute_key: 'plan', attribute_model: :contact_attribute)

        expect(service.sanitize(%w[booking_id booking_id plan nope])).to eq(['booking_id'])
      end
    end
  end
end
