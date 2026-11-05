# FlightsMojo (FM-39): one email per agent after a ticket distribution, in place
# of one "a conversation has been assigned to you" email per ticket.
class TicketDistributionMailer < ApplicationMailer
  def summary(agent, count, administrator)
    return unless smtp_config_set_or_development?

    @agent = agent
    @ticket_count = count
    @administrator_name = administrator.available_name
    @action_url = "#{root_url}app/accounts/#{Current.account.id}/dashboard"
    subject = "#{@agent.available_name}, #{@administrator_name} assigned you #{count} #{'ticket'.pluralize(count)}"
    send_mail_with_liquid(to: @agent.email, subject: subject) and return
  end

  private

  def liquid_locals
    super.merge(ticket_count: @ticket_count, administrator_name: @administrator_name)
  end
end
