class Api::V1::Accounts::BulkActionsController < Api::V1::Accounts::BaseController
  before_action :validate_assignment_targets, only: :create, if: -> { normalized_type == 'Conversation' }
  # FlightsMojo (FM-24): the bulk Resolve honours the required conversation attributes too.
  before_action :ensure_required_attributes_filled_for_bulk_resolve, only: :create, if: -> { normalized_type == 'Conversation' }

  def create
    case normalized_type
    when 'Conversation'
      enqueue_conversation_job
      head :ok
    when 'Contact'
      check_authorization_for_contact_action
      enqueue_contact_job
      head :ok
    else
      render json: { success: false }, status: :unprocessable_entity
    end
  end

  private

  # FlightsMojo (FM-24): a person resolving several tickets at once must have filled the
  # attributes the administrator made mandatory (for example the Booking ID) on each of
  # them, exactly like the single-ticket endpoint (RequiredAttributesGuard). Bots and the
  # other bulk fields are not affected.
  def ensure_required_attributes_filled_for_bulk_resolve
    return unless bulk_resolve_by_user?

    service = Conversations::RequiredAttributesService.new(Current.account)
    blocked = conversations_missing_required_attributes(service)
    return if blocked.empty?

    render_missing_required_attributes(service, blocked)
  end

  def bulk_resolve_by_user?
    Current.user.is_a?(User) && conversation_params.dig(:fields, :status) == 'resolved'
  end

  # [[display_id, missing keys], ...] for the selected conversations that still miss one.
  def conversations_missing_required_attributes(service)
    return [] if service.required_keys.empty?

    Current.account.conversations.where(display_id: params[:ids]).filter_map do |conversation|
      missing = service.missing_keys(conversation)
      [conversation.display_id, missing] if missing.any?
    end
  end

  def render_missing_required_attributes(service, blocked)
    keys = blocked.flat_map(&:last).uniq
    render json: { error: I18n.t('conversations.required_attributes.missing_bulk',
                                 attributes: service.display_names(keys).join(', '),
                                 ids: blocked.map { |id, _missing| "##{id}" }.join(', ')),
                   missing_attributes: keys,
                   conversation_ids: blocked.map(&:first) }, status: :unprocessable_entity
  end

  def normalized_type
    params[:type].to_s.camelize
  end

  def validate_assignment_targets
    fields = conversation_params[:fields] || {}

    assignee_id = fields[:assignee_id]
    return render_could_not_create_error('Invalid assignee_id') if !assignee_id.nil? && !@current_account.users.exists?(id: assignee_id)

    team_id = fields[:team_id]
    # The dashboard sends 0 to remove the team assignment; accept '0' from form-encoded requests too.
    return if [nil, 0, '0'].include?(team_id) || @current_account.teams.exists?(id: team_id)

    render_could_not_create_error('Invalid team_id')
  end

  def enqueue_conversation_job
    ::BulkActionsJob.perform_later(
      account: @current_account,
      user: current_user,
      params: conversation_params
    )
  end

  def enqueue_contact_job
    Contacts::BulkActionJob.perform_later(
      @current_account.id,
      current_user.id,
      contact_params
    )
  end

  def delete_contact_action?
    params[:action_name] == 'delete'
  end

  def check_authorization_for_contact_action
    authorize(Contact, :destroy?) if delete_contact_action?
  end

  def conversation_params
    # TODO: Align conversation payloads with the `{ action_name, action_attributes }`
    # and then remove this method in favor of a common params method.
    base = params.permit(
      :snoozed_until,
      fields: [:status, :assignee_id, :team_id]
    )
    append_common_bulk_attributes(base)
  end

  def contact_params
    # TODO: remove this method in favor of a common params method.
    # once legacy conversation payloads are migrated.
    append_common_bulk_attributes({})
  end

  def append_common_bulk_attributes(base_params)
    # NOTE: Conversation payloads historically diverged per action. Going forward we
    # want all objects to share a common contract: `{ action_name, action_attributes }`
    common = params.permit(:type, :action_name, ids: [], labels: [add: [], remove: []])
    base_params.merge(common)
  end
end
