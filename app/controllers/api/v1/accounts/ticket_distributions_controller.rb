# FlightsMojo (FM-39): administrators share unsolved tickets equally among the
# agents they pick. GET = what the Distribute window needs, POST preview = who
# would get what (nothing changes), POST = carry out a preview, GET status = progress.
class Api::V1::Accounts::TicketDistributionsController < Api::V1::Accounts::BaseController
  before_action -> { check_authorization(:ticket_distribution) }

  def show
    render json: { agents: agents_payload, inboxes: inboxes_payload,
                   teams: Current.account.teams.order(:name).map { |team| { id: team.id, name: team.name } } }
  end

  def preview
    builder = TicketDistribution::PlanBuilder.new(account: Current.account, agent_ids: params[:agent_ids], filters: filter_params)
    plan = builder.perform
    token = TicketDistribution::Store.save_plan(
      account_id: Current.account.id, user_id: Current.user.id,
      plan: { moves: plan[:moves], auto_assignment_inbox_ids: plan[:auto_assignment_inbox_ids] }
    )
    render json: plan.except(:moves).merge(token: token, moving: plan[:moves].size,
                                           expires_in: TicketDistribution::Store::PLAN_TTL.to_i)
  rescue TicketDistribution::PlanBuilder::InvalidRequest => e
    render json: { error: e.message }, status: :unprocessable_entity
  end

  def create
    plan = TicketDistribution::Store.take_plan(params[:token], account_id: Current.account.id, user_id: Current.user.id)
    return render json: { error: 'This preview has expired or was already used. Preview again.' }, status: :unprocessable_entity unless plan

    turned_off = turn_off_auto_assignment(plan[:auto_assignment_inbox_ids])
    moves = plan[:moves] || []
    queue_moves(moves)
    render json: { token: params[:token], total: moves.size, auto_assignment_turned_off: turned_off }
  end

  def status
    status = TicketDistribution::Store.read_status(params[:token], account_id: Current.account.id)
    return render json: { error: 'Not found' }, status: :not_found unless status

    render json: status
  end

  private

  def queue_moves(moves)
    TicketDistribution::Store.write_status(params[:token], account_id: Current.account.id, state: 'queued', total: moves.size,
                                                           moved: 0, skipped: 0)
    TicketDistribution::ApplyJob.perform_later(account_id: Current.account.id, user_id: Current.user.id, token: params[:token],
                                               moves: moves)
  end

  def filter_params
    { inbox_ids: params[:inbox_ids], team_id: params[:team_id], include_snoozed: params[:include_snoozed] }
  end

  def turn_off_auto_assignment(inbox_ids)
    return [] unless ActiveModel::Type::Boolean.new.cast(params[:turn_off_auto_assignment])

    inboxes = Current.account.inboxes.where(id: Array(inbox_ids), enable_auto_assignment: true).to_a
    inboxes.each { |inbox| inbox.update!(enable_auto_assignment: false) }
    inboxes.map(&:id)
  end

  def agents_payload
    open_counts = Current.account.conversations.where(status: :open).where.not(assignee_id: nil).group(:assignee_id).count
    # Shown for information only: who is picked is the administrator's choice.
    statuses = OnlineStatusTracker.get_available_users(Current.account.id)
    rows = Current.account.account_users.includes(:user).select(&:user).map do |account_user|
      agent_row(account_user, statuses, open_counts)
    end
    rows.sort_by { |agent| agent[:name].to_s.downcase }
  end

  def agent_row(account_user, statuses, open_counts)
    user = account_user.user
    { id: user.id, name: user.available_name, role: account_user.role,
      availability_status: statuses[user.id.to_s] || 'offline', open_count: open_counts[user.id] || 0 }
  end

  def inboxes_payload
    open_counts = Current.account.conversations.where(status: :open).group(:inbox_id).count
    Current.account.inboxes.order(:name).map do |inbox|
      { id: inbox.id, name: inbox.name, enable_auto_assignment: inbox.enable_auto_assignment, member_ids: inbox.members.ids,
        open_count: open_counts[inbox.id] || 0 }
    end
  end
end
