# FlightsMojo (FM-34): the ticket table sorts by any of its columns. Names are compared
# case-insensitively, rows without a value come last, and recent activity breaks ties so
# pagination stays stable. Kept apart from SortHandler so the upstream file stays as it is.
module TicketSortHandler
  extend ActiveSupport::Concern

  # Lifecycle order rather than the enum's numbers.
  STATUS_LIFECYCLE = %w[open pending snoozed resolved].freeze

  class_methods do
    def sort_on_status(sort_direction = :asc)
      ranks = STATUS_LIFECYCLE.each_with_index.map { |status, rank| "WHEN #{statuses.fetch(status)} THEN #{rank}" }
      order(generate_sql_query(
              "CASE conversations.status #{ranks.join(' ')} ELSE #{STATUS_LIFECYCLE.size} END #{sort_direction.to_s.upcase}, " \
              'conversations.last_activity_at DESC'
            ))
    end

    def sort_on_requester(sort_direction = :asc)
      sort_on_name_of(:contact, 'contacts', sort_direction)
    end

    def sort_on_assignee(sort_direction = :asc)
      sort_on_name_of(:assignee, 'users', sort_direction)
    end

    def sort_on_team(sort_direction = :asc)
      sort_on_name_of(:team, 'teams', sort_direction)
    end

    def sort_on_inbox(sort_direction = :asc)
      sort_on_name_of(:inbox, 'inboxes', sort_direction)
    end

    private

    # Case-insensitive sort on the name of a joined record; conversations without one come last.
    def sort_on_name_of(association, table, sort_direction)
      left_outer_joins(association).order(generate_sql_query(
                                            "LOWER(#{table}.name) #{sort_direction.to_s.upcase} NULLS LAST, conversations.last_activity_at DESC"
                                          ))
    end
  end
end
