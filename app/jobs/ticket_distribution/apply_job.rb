# FlightsMojo (FM-39): carries out a confirmed ticket distribution. Each ticket is
# re-checked under a row lock and moved only if it is still unsolved and still with
# the agent the preview saw, so tickets resolved or taken meanwhile are skipped.
# The timeline says "Assigned to X by <administrator>"; per-ticket notifications
# are replaced by one summary email per agent.
class TicketDistribution::ApplyJob < ApplicationJob
  queue_as :medium

  MOVABLE_STATUSES = %w[open snoozed].freeze
  PROGRESS_EVERY = 25
  # A short breather between tickets so a big distribution never hogs the CPU the
  # dashboard needs (measured on a one-core copy: dashboard list 2x slower without it).
  PAUSE_BETWEEN_MOVES = ENV.fetch('TICKET_DISTRIBUTION_PAUSE_MS', 40).to_i / 1000.0

  def perform(account_id:, user_id:, token:, moves:)
    @account = Account.find(account_id)
    @user = User.find(user_id)
    @token = token
    set_current
    @result = { total: moves.size, moved: 0, skipped: 0, received: Hash.new(0) }
    write_status('running')

    TicketDistribution::QuietAssignment.wrap { run(moves) }

    send_summaries
    write_status('done')
  rescue StandardError => e
    write_status('failed', error: e.message) if @account
    raise
  ensure
    Current.reset
  end

  private

  def set_current
    Current.account = @account
    Current.user = @user
    Current.account_user = @account.account_users.find_by(user_id: @user.id)
  end

  def run(moves)
    moves.each_with_index do |(conversation_id, from_id, to_id), index|
      if move(conversation_id, from_id, to_id)
        @result[:moved] += 1
        @result[:received][to_id] += 1
      else
        @result[:skipped] += 1
      end
      write_status('running') if ((index + 1) % PROGRESS_EVERY).zero?
      sleep(PAUSE_BETWEEN_MOVES) if PAUSE_BETWEEN_MOVES.positive?
    end
  end

  def move(conversation_id, from_id, to_id)
    moved = false
    Conversation.transaction do
      conversation = @account.conversations.lock('FOR UPDATE SKIP LOCKED').find_by(id: conversation_id)
      if still_as_previewed?(conversation, from_id)
        conversation.update!(assignee_id: to_id)
        moved = true
      end
    end
    moved
  end

  def still_as_previewed?(conversation, from_id)
    conversation.present? &&
      MOVABLE_STATUSES.include?(conversation.status) &&
      conversation.assignee_agent_bot_id.nil? &&
      conversation.assignee_id == from_id
  end

  # One email per agent who received tickets, if they get assignment emails at all.
  def send_summaries
    @result[:received].each do |agent_id, count|
      next if agent_id == @user.id

      agent = @account.users.find_by(id: agent_id)
      next unless agent && assignment_email_enabled?(agent)

      TicketDistributionMailer.with(account: @account).summary(agent, count, @user).deliver_later
    end
  end

  def assignment_email_enabled?(agent)
    setting = agent.notification_settings.find_by(account_id: @account.id)
    setting.present? && setting.email_conversation_assignment?
  end

  def write_status(state, **extra)
    TicketDistribution::Store.write_status(@token, account_id: @account.id, state: state, total: @result&.dig(:total),
                                                   moved: @result&.dig(:moved), skipped: @result&.dig(:skipped), **extra)
  end
end
