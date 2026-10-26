# FlightsMojo: switch on the two admin controls we built ourselves, for the accounts that
# already exist: required attributes before resolving (Settings → Conversation Workflow) and
# agent capacity / balanced assignment (Settings → Agent Assignment). Switching them on
# changes nothing by itself: no attribute is required and no capacity policy exists until an
# administrator sets one up. Reversible: down switches them off again.
class EnableAdminControlsForExistingAccounts < ActiveRecord::Migration[7.0]
  FEATURES = %w[conversation_required_attributes advanced_assignment].freeze

  def up
    Account.find_each(batch_size: 100) do |account|
      account.enable_features(*FEATURES)
      account.save(validate: false) # a plain save would silently skip an account that fails a validation
    end
  end

  def down
    Account.find_each(batch_size: 100) do |account|
      account.disable_features(*FEATURES)
      account.save(validate: false)
    end
  end
end
