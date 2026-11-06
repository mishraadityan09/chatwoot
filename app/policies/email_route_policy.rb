# FlightsMojo (FM-41): only administrators may see or change which inbox new mail goes to.
class EmailRoutePolicy < ApplicationPolicy
  def show?
    @account_user.administrator?
  end

  def update?
    @account_user.administrator?
  end

  def check?
    @account_user.administrator?
  end
end
