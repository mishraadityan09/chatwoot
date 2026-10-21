class AsyncDispatcher < BaseDispatcher
  def dispatch(event_name, timestamp, data)
    # FlightsMojo: listeners run in Sidekiq, where Current is gone. Record here whether anybody
    # was behind the change (agent, bot, contact, automation rule, assistant) so the reporting
    # listener can keep scheduled auto-resolutions off the agents' resolution counts.
    EventDispatcherJob.perform_later(event_name, timestamp, data.to_h.merge(fm_system_action: fm_system_action?))
  end

  def publish_event(event_name, timestamp, data)
    event_object = Events::Base.new(event_name, timestamp, data)
    publish(event_object.method_name, event_object)
  end

  def listeners
    [
      AutomationRuleListener.instance,
      CampaignListener.instance,
      CsatSurveyListener.instance,
      HookListener.instance,
      InstallationWebhookListener.instance,
      NotificationListener.instance,
      ParticipationListener.instance,
      Conversations::UnreadCounts::Listener.instance,
      ReportingEventListener.instance,
      WebhookListener.instance
    ]
  end

  private

  # FlightsMojo: true when no user, bot, contact or automation is behind the change (a scheduled job).
  def fm_system_action?
    Current.user.nil? && Current.executed_by.nil? && Current.contact.nil?
  end
end

AsyncDispatcher.prepend_mod_with('AsyncDispatcher')
