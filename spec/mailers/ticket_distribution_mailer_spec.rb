require 'rails_helper'

RSpec.describe TicketDistributionMailer do
  let(:class_instance) { described_class.new }
  let(:account) { create(:account) }
  let(:agent) { create(:user, email: 'anmol@example.com', name: 'Anmol', display_name: 'Anmol', account: account) }
  let(:administrator) { create(:user, name: 'Harsh', display_name: 'Harsh', account: account, role: :administrator) }
  let(:mail) { described_class.with(account: account).summary(agent, 40, administrator).deliver_now }

  before do
    allow(described_class).to receive(:new).and_return(class_instance)
    allow(class_instance).to receive(:smtp_config_set_or_development?).and_return(true)
  end

  it 'tells the agent how many tickets they were given and by whom' do
    expect(mail.to).to eq(['anmol@example.com'])
    expect(mail.subject).to eq('Anmol, Harsh assigned you 40 tickets')
    expect(mail.body.encoded).to include('40 of them are now assigned to you')
    expect(mail.body.encoded).to include("/app/accounts/#{account.id}/dashboard")
  end
end
