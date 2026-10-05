# FlightsMojo: an agent cannot resolve a conversation that is missing the attributes the
# administrator made mandatory (Settings → Conversation Workflow). The dashboard asks for them
# first; this stops other API clients. Bots are not affected, so auto-resolve keeps working.
module RequiredAttributesGuard
  extend ActiveSupport::Concern

  included do
    before_action :ensure_required_attributes_filled, only: [:toggle_status] # rubocop:disable Rails/LexicallyScopedActionFilter
  end

  private

  # `conversation` is the controller's own finder (it also checks the user may see it); this
  # filter is declared before the controller's before_action that sets @conversation.
  def ensure_required_attributes_filled
    return unless Current.user.is_a?(User) && resolving_conversation?

    service = Conversations::RequiredAttributesService.new(Current.account)
    missing = service.missing_keys(conversation)
    return if missing.empty?

    render json: { error: I18n.t('conversations.required_attributes.missing', attributes: service.display_names(missing).join(', ')),
                   missing_attributes: missing }, status: :unprocessable_entity
  end

  def resolving_conversation?
    return params[:status] == 'resolved' if params[:status].present?

    conversation.open? # no status given: the endpoint flips open → resolved
  end
end
