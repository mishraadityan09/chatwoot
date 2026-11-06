# FlightsMojo (FM-39): while a distribution moves tickets, the usual
# "a conversation has been assigned to you" notification (email + push + bell)
# is skipped for each ticket; ApplyJob sends every agent one summary instead.
# Read by Conversation#notifiable_assignee_change?, which runs in the same
# thread as the move (the event payload is built before it goes to Sidekiq).
module TicketDistribution::QuietAssignment
  KEY = :fm_ticket_distribution_quiet_assignment

  module_function

  def wrap
    previous = Thread.current[KEY]
    Thread.current[KEY] = true
    yield
  ensure
    Thread.current[KEY] = previous
  end

  def active?
    Thread.current[KEY] == true
  end
end
