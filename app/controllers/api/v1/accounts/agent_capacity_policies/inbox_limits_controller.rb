# FlightsMojo: the most open conversations an agent of the policy may hold in one inbox.
class Api::V1::Accounts::AgentCapacityPolicies::InboxLimitsController < Api::V1::Accounts::BaseController
  before_action :fetch_policy
  before_action :fetch_limit, only: [:update, :destroy]
  before_action -> { check_authorization(AgentCapacityPolicy) }

  def create
    inbox = Current.account.inboxes.find(params[:inbox_id])
    limit = @policy.inbox_capacity_limits.create!(inbox: inbox, conversation_limit: params[:conversation_limit])
    render json: limit.api_json
  end

  def update
    @limit.update!(conversation_limit: params[:conversation_limit])
    render json: @limit.api_json
  end

  def destroy
    @limit.destroy!
    head :ok
  end

  private

  def fetch_policy
    @policy = Current.account.agent_capacity_policies.find(params[:agent_capacity_policy_id])
  end

  def fetch_limit
    @limit = @policy.inbox_capacity_limits.find(params[:id])
  end
end
