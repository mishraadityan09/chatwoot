# FlightsMojo (FM-41): Settings → Email Routing. GET = the saved rules and the email inboxes to pick
# from, PUT = save the ordered rules, POST check = where a mail would go under the rules on screen
# (nothing is saved).
class Api::V1::Accounts::EmailRoutesController < Api::V1::Accounts::BaseController
  before_action -> { check_authorization(:email_route) }

  def show
    render json: payload
  end

  def update
    # A missing or non-list `rules` must never be read as "no rules" and wipe what was saved.
    return render json: { errors: ['rules must be a list'] }, status: :unprocessable_entity unless params[:rules].is_a?(Array)

    rules, errors = EmailRoutes::Settings.sanitize(Current.account, rules_param)
    return render json: { errors: errors }, status: :unprocessable_entity if errors.any?

    EmailRoutes::Settings.save!(Current.account, rules, user: Current.user)
    render json: payload
  end

  def check
    rules, errors = checker_rules
    return render json: { errors: errors }, status: :unprocessable_entity if errors.any?

    render json: EmailRoutes::Settings.check(Current.account, rules: rules, from: params[:from], to: params[:to])
  end

  private

  # The rules on screen (unsaved changes included) when the page sends them, otherwise the saved ones.
  def checker_rules
    return [EmailRoutes.stored(Current.account), []] unless params.key?(:rules)

    EmailRoutes::Settings.sanitize(Current.account, rules_param)
  end

  def rules_param
    params.permit(rules: [:inbox_id, { senders: [] }, { recipients: [] }])[:rules]
  end

  def payload
    account = Current.account.reload
    inboxes = EmailRoutes.email_inboxes(account).includes(:channel).order(:name)
    members = InboxMember.where(inbox_id: inboxes.map(&:id)).group(:inbox_id).count
    { rules: EmailRoutes.stored(account), changed: account.settings&.dig(EmailRoutes::CHANGED_KEY),
      inboxes: inboxes.map { |inbox| { id: inbox.id, name: inbox.name, email: inbox.channel.email, members: members.fetch(inbox.id, 0) } } }
  end
end
