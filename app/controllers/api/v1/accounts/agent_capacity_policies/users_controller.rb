# FlightsMojo: the agents a capacity policy applies to (one policy per agent).
class Api::V1::Accounts::AgentCapacityPolicies::UsersController < Api::V1::Accounts::BaseController
  before_action :fetch_policy
  before_action -> { check_authorization(AgentCapacityPolicy) }

  def index
    render json: @policy.account_users.includes(:user).map { |account_user| user_json(account_user.user) }
  end

  def create
    account_user = Current.account.account_users.find_by!(user_id: params[:user_id])
    account_user.update!(agent_capacity_policy: @policy)
    render json: user_json(account_user.user)
  end

  def destroy
    account_user = @policy.account_users.find_by!(user_id: params[:id])
    account_user.update!(agent_capacity_policy: nil)
    head :ok
  end

  private

  def fetch_policy
    @policy = Current.account.agent_capacity_policies.find(params[:agent_capacity_policy_id])
  end

  def user_json(user)
    { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url }
  end
end
