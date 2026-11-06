# FlightsMojo (FM-39): only administrators may share tickets out among agents.
class TicketDistributionPolicy < ApplicationPolicy
  def show?
    @account_user.administrator?
  end

  def preview?
    @account_user.administrator?
  end

  def create?
    @account_user.administrator?
  end

  def status?
    @account_user.administrator?
  end
end
