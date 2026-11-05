# FlightsMojo (FM-39): keeps a previewed distribution in Redis until the
# administrator confirms it (single use, 15 minutes), and the progress of a
# running one so the dashboard can show "Done: 312 moved, 6 skipped".
module TicketDistribution::Store
  PLAN_TTL = 15.minutes
  STATUS_TTL = 1.hour

  module_function

  def save_plan(account_id:, user_id:, plan:)
    token = SecureRandom.uuid
    ::Redis::Alfred.set(plan_key(token), plan.merge(account_id: account_id, user_id: user_id).to_json, ex: PLAN_TTL.to_i)
    token
  end

  # Returns the plan once and removes it, so a double click cannot apply it twice.
  def take_plan(token, account_id:, user_id:)
    return if token.blank?

    raw = ::Redis::Alfred.get(plan_key(token))
    return if raw.blank?
    return unless ::Redis::Alfred.delete(plan_key(token)).to_i.positive?

    plan = JSON.parse(raw).with_indifferent_access
    plan if plan[:account_id] == account_id && plan[:user_id] == user_id
  end

  def write_status(token, account_id:, **status)
    ::Redis::Alfred.set(status_key(token), status.merge(account_id: account_id).to_json, ex: STATUS_TTL.to_i)
  end

  def read_status(token, account_id:)
    return if token.blank?

    raw = ::Redis::Alfred.get(status_key(token))
    return if raw.blank?

    status = JSON.parse(raw).with_indifferent_access
    status.except(:account_id) if status[:account_id] == account_id
  end

  def plan_key(token)
    "FM_TICKET_DISTRIBUTION::PLAN::#{token}"
  end

  def status_key(token)
    "FM_TICKET_DISTRIBUTION::STATUS::#{token}"
  end
end
