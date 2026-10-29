require 'rails_helper'
describe AsyncDispatcher do
  subject(:dispatcher) { described_class.new }

  let!(:conversation) { create(:conversation) }
  let(:event_name) { 'conversation.created' }
  let(:timestamp) { Time.zone.now }
  let(:event_data) { { conversation: conversation } }

  describe '#dispatch' do
    it 'enqueue job to dispatch event' do
      expect(EventDispatcherJob).to receive(:perform_later).with(event_name, timestamp, hash_including(event_data)).once
      dispatcher.dispatch(event_name, timestamp, event_data)
    end

    # FlightsMojo: whether anybody was behind the change travels with the event
    it 'flags the event as a system action when nobody is behind it' do
      expect(EventDispatcherJob).to receive(:perform_later).with(event_name, timestamp, event_data.merge(fm_system_action: true)).once
      dispatcher.dispatch(event_name, timestamp, event_data)
    end

    context 'when a user is behind the change' do
      before { Current.user = create(:user) }

      after { Current.reset }

      it 'does not flag the event as a system action' do
        expect(EventDispatcherJob).to receive(:perform_later).with(event_name, timestamp, event_data.merge(fm_system_action: false)).once
        dispatcher.dispatch(event_name, timestamp, event_data)
      end
    end
  end
end
