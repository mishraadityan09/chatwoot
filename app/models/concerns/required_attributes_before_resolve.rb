# FlightsMojo (FM-24): the last line of defence behind the controller guards. Whoever is signed
# in cannot save a conversation as resolved while an attribute the administrator made mandatory
# (for example the Booking ID) is still missing. The controllers refuse first with their own
# message; this catches every other path. Bots, automation rules and the auto-resolver run with
# no signed-in user and are not affected.
module RequiredAttributesBeforeResolve
  extend ActiveSupport::Concern

  included do
    validate :required_attributes_filled_before_resolve,
             if: -> { Current.user.is_a?(User) && will_save_change_to_status? && resolved? }
  end

  private

  def required_attributes_filled_before_resolve
    service = Conversations::RequiredAttributesService.new(account)
    missing = service.missing_keys(self)
    return if missing.empty?

    errors.add(:base, I18n.t('conversations.required_attributes.missing', attributes: service.display_names(missing).join(', ')))
  end
end
