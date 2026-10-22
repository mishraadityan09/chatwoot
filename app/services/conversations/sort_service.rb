class Conversations::SortService
  DEFAULT_SORT = 'last_activity_at_desc'.freeze
  SORT_OPTIONS = {
    'last_activity_at_asc' => %w[sort_on_last_activity_at asc],
    'last_activity_at_desc' => %w[sort_on_last_activity_at desc],
    'created_at_asc' => %w[sort_on_created_at asc],
    'created_at_desc' => %w[sort_on_created_at desc],
    'priority_asc' => %w[sort_on_priority asc],
    'priority_desc' => %w[sort_on_priority desc],
    'waiting_since_asc' => %w[sort_on_waiting_since asc],
    'waiting_since_desc' => %w[sort_on_waiting_since desc],
    'priority_desc_created_at_asc' => %w[sort_on_priority_created_at desc],
    'unread' => %w[sort_on_unread desc],
    # FlightsMojo (FM-34): the ticket table's column sorts
    'status_asc' => %w[sort_on_status asc],
    'status_desc' => %w[sort_on_status desc],
    'requester_asc' => %w[sort_on_requester asc],
    'requester_desc' => %w[sort_on_requester desc],
    'assignee_asc' => %w[sort_on_assignee asc],
    'assignee_desc' => %w[sort_on_assignee desc],
    'team_asc' => %w[sort_on_team asc],
    'team_desc' => %w[sort_on_team desc],
    'inbox_asc' => %w[sort_on_inbox asc],
    'inbox_desc' => %w[sort_on_inbox desc],

    # To be removed in v3.5.0
    'latest' => %w[sort_on_last_activity_at desc],
    'sort_on_created_at' => %w[sort_on_created_at asc],
    'sort_on_priority' => %w[sort_on_priority desc],
    'sort_on_waiting_since' => %w[sort_on_waiting_since asc]
  }.with_indifferent_access.freeze

  def self.apply(scope, sort_by)
    sort_method, sort_order = SORT_OPTIONS[sort_by] || SORT_OPTIONS[DEFAULT_SORT]
    scope.public_send(sort_method, sort_order)
  end
end
