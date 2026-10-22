module SortHandler
  extend ActiveSupport::Concern

  class_methods do
    def sort_on_last_activity_at(sort_direction = :desc)
      order(last_activity_at: sort_direction)
    end

    def sort_on_created_at(sort_direction = :asc)
      # The id tie-breaker keeps pagination stable when created_at values collide.
      order(created_at: sort_direction, id: sort_direction)
    end

    def sort_on_priority(sort_direction = :desc)
      order(generate_sql_query("priority #{sort_direction.to_s.upcase} NULLS LAST, last_activity_at DESC"))
    end

    def sort_on_priority_created_at(sort_direction = :desc)
      order(generate_sql_query("priority #{sort_direction.to_s.upcase} NULLS LAST, created_at ASC"))
    end

    def sort_on_waiting_since(sort_direction = :asc)
      order(generate_sql_query("(waiting_since IS NULL), waiting_since #{sort_direction.to_s.upcase}, created_at ASC"))
    end

    # FlightsMojo (FM-34): the ticket table sorts by any of its columns. Names
    # are compared case-insensitively; rows without a value come last; recent
    # activity breaks ties so pagination stays stable.
    def sort_on_status(sort_direction = :asc)
      # Lifecycle order rather than the enum's: open, pending, snoozed, resolved.
      order(generate_sql_query(
              "CASE conversations.status WHEN 0 THEN 0 WHEN 2 THEN 1 WHEN 3 THEN 2 ELSE 3 END #{sort_direction.to_s.upcase}, " \
              'conversations.last_activity_at DESC'
            ))
    end

    def sort_on_requester(sort_direction = :asc)
      joins(:contact).order(generate_sql_query(
                              "LOWER(contacts.name) #{sort_direction.to_s.upcase} NULLS LAST, conversations.last_activity_at DESC"
                            ))
    end

    def sort_on_assignee(sort_direction = :asc)
      left_outer_joins(:assignee).order(generate_sql_query(
                                          "LOWER(users.name) #{sort_direction.to_s.upcase} NULLS LAST, conversations.last_activity_at DESC"
                                        ))
    end

    def sort_on_team(sort_direction = :asc)
      left_outer_joins(:team).order(generate_sql_query(
                                      "LOWER(teams.name) #{sort_direction.to_s.upcase} NULLS LAST, conversations.last_activity_at DESC"
                                    ))
    end

    def sort_on_inbox(sort_direction = :asc)
      joins(:inbox).order(generate_sql_query(
                            "LOWER(inboxes.name) #{sort_direction.to_s.upcase}, conversations.last_activity_at DESC"
                          ))
    end

    def last_messaged_conversations
      Message.except(:order).select(
        'DISTINCT ON (conversation_id) conversation_id, id, created_at, message_type'
      ).order('conversation_id, created_at DESC')
    end

    def sort_on_last_user_message_at
      order('grouped_conversations.message_type', 'grouped_conversations.created_at ASC')
    end

    private

    def generate_sql_query(query)
      Arel::Nodes::SqlLiteral.new(sanitize_sql_for_order(query))
    end
  end
end
