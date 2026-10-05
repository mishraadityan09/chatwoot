# FlightsMojo: Settings → Agent Assignment → Agent capacity (see AgentCapacityPolicy).
class Api::V1::Accounts::AgentCapacityPoliciesController < Api::V1::Accounts::BaseController
  before_action :fetch_policy, only: [:show, :update, :destroy]
  before_action :check_authorization

  def index
    policies = Current.account.agent_capacity_policies.includes(:inbox_capacity_limits).order(:id)
    render json: policies.map(&:api_json)
  end

  def show
    render json: @policy.api_json
  end

  def create
    policy = Current.account.agent_capacity_policies.create!(policy_params)
    render json: policy.api_json
  end

  def update
    @policy.update!(policy_params)
    render json: @policy.api_json
  end

  def destroy
    @policy.destroy!
    head :ok
  end

  private

  def fetch_policy
    @policy = Current.account.agent_capacity_policies.find(params[:id])
  end

  def policy_params
    params.require(:agent_capacity_policy).permit(:name, :description,
                                                  exclusion_rules: [:exclude_older_than_hours, { excluded_labels: [] }])
  end
end
