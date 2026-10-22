// FlightsMojo (FM-37): informational types in iris, not blue-11 (which the
// theme maps to the brand red); SLA misses keep ruby. The class is generated
// because components-next uses it.
export const NOTIFICATION_TYPES_MAPPING = {
  CONVERSATION_MENTION: ['i-lucide-at-sign', 'text-n-iris-11'],
  CONVERSATION_ASSIGNMENT: ['i-lucide-chevrons-right', 'text-n-iris-11'],
  CONVERSATION_CREATION: ['i-lucide-mail-plus', 'text-n-iris-11'],
  PARTICIPATING_CONVERSATION_NEW_MESSAGE: [
    'i-lucide-message-square-plus',
    'text-n-iris-11',
  ],
  ASSIGNED_CONVERSATION_NEW_MESSAGE: [
    'i-lucide-message-square-plus',
    'text-n-iris-11',
  ],
  SLA_MISSED_FIRST_RESPONSE: ['i-lucide-heart-crack', 'text-n-ruby-11'],
  SLA_MISSED_NEXT_RESPONSE: ['i-lucide-heart-crack', 'text-n-ruby-11'],
  SLA_MISSED_RESOLUTION: ['i-lucide-heart-crack', 'text-n-ruby-11'],
};
