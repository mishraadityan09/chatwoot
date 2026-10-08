// FlightsMojo: state shared by the Zendesk-style ticket table. The table is
// Chatwoot's expanded conversation layout with our FmTicketRow in place of
// ConversationCardExpanded; ConversationList calls useTicketTable once.
import { computed, inject, provide, ref, toValue, watch } from 'vue';
import { createSharedComposable, useNow } from '@vueuse/core';
import { useMapGetter } from 'dashboard/composables/store';
import { useUISettings } from 'dashboard/composables/useUISettings';
import wootConstants from 'dashboard/constants/globals';

export const TICKET_GROUPS_KEY = Symbol('fmTicketGroups');
// Height of the sticky table header, measured by FmTicketTableHeader. The
// header sits inside the list's scroll container *before* the Virtualizer,
// so the Virtualizer needs it as startMargin (virtua: "If you put an element
// before virtualizer, you have to set its height to this prop") — without it
// virtua renders the wrong range: blank areas, bursts of page loads, jumps.
export const TICKET_HEADER_HEIGHT_KEY = Symbol('fmTicketHeaderHeight');

// Highest first, matching Chatwoot's priority_desc sort.
export const PRIORITY_KEYS = ['URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export const priorityKey = priority =>
  PRIORITY_KEYS.includes(String(priority).toUpperCase())
    ? String(priority).toUpperCase()
    : 'NONE';

/**
 * Priority groups for the loaded rows, Zendesk-style ("High (12)").
 * Returns a Map from the id of each group's first row to { key, count }.
 * Empty when the rows are not in priority order (e.g. sorted by latest), so
 * headers only appear when they describe the list truthfully.
 * @param {Array} list - conversations in display order
 * @returns {Map<number, {key: string, count: number}>}
 */
export const getTicketGroups = list => {
  const groups = new Map();
  if (!Array.isArray(list)) return groups;

  let previousRank = -1;
  let current = null;
  for (let i = 0; i < list.length; i += 1) {
    const chat = list[i];
    const key = priorityKey(chat.priority);
    const rank = PRIORITY_KEYS.indexOf(key);
    if (rank < previousRank) return new Map();
    if (!current || current.key !== key) {
      current = { key, count: 0 };
      groups.set(chat.id, current);
    }
    current.count += 1;
    previousRank = rank;
  }
  return groups;
};

/** Group info for one row, or null when the row doesn't start a group. */
export const useTicketGroup = chatId => {
  const groups = inject(TICKET_GROUPS_KEY, null);
  return computed(() => groups?.value.get(toValue(chatId)) || null);
};

// Zendesk-style defaults, applied ONCE per agent (recorded in their UI
// settings as flightsmojo_defaults_version, so later choices always stick):
// - Layout: agents who never picked one land on the table. Anyone who chose
//   (previously_used_conversation_display_type is set by both layout toggles)
//   keeps it. Both keys are written so every upstream reader of
//   conversation_display_type (which default to "condensed") agrees.
// - Sort: agents with no sort, or Chatwoot's default "Last activity" (which
//   the status filter saves even when nobody chose it), get "Priority: Highest
//   first, Created: Oldest first", so the table opens grouped by priority,
//   oldest first. Any other saved sort was a deliberate choice and is kept.
//   Stored where the sort menu stores it (conversations_filter_by.order_by);
//   ChatList reads it in onMounted, after this runs in ConversationList's
//   setup, so it applies on the first load.
export const DEFAULTS_VERSION = 1;
let defaultLayoutChecked = false;
export const useDefaultTicketLayout = () => {
  const { uiSettings, updateUISettings } = useUISettings();
  const currentUser = useMapGetter('getCurrentUser');
  const { EXPANDED } = wootConstants.LAYOUT_TYPES;
  const { PRIORITY_DESC_CREATED_AT_ASC, LAST_ACTIVITY_AT_DESC } =
    wootConstants.SORT_BY_TYPE;

  watch(
    [uiSettings, currentUser],
    () => {
      if (defaultLayoutChecked || !currentUser.value?.id) return;
      defaultLayoutChecked = true;

      const settings = uiSettings.value || {};
      if ((settings.flightsmojo_defaults_version || 0) >= DEFAULTS_VERSION) {
        return;
      }

      const updates = { flightsmojo_defaults_version: DEFAULTS_VERSION };
      if (!settings.previously_used_conversation_display_type) {
        updates.conversation_display_type = EXPANDED;
        updates.previously_used_conversation_display_type = EXPANDED;
      }
      const filterBy = settings.conversations_filter_by || {};
      if (!filterBy.order_by || filterBy.order_by === LAST_ACTIVITY_AT_DESC) {
        updates.conversations_filter_by = {
          ...filterBy,
          order_by: PRIORITY_DESC_CREATED_AT_ASC,
        };
      }
      updateUISettings(updates);
    },
    { immediate: true }
  );
};

// Test hook: the check runs once per page load.
export const resetDefaultTicketLayoutCheck = () => {
  defaultLayoutChecked = false;
};

/**
 * Called once by ConversationList.
 * @param list - the rendered conversations (getter or ref)
 * @returns {{ headerHeight: import('vue').Ref<number> }} for the
 *   Virtualizer's start-margin
 */
export const useTicketTable = list => {
  provide(
    TICKET_GROUPS_KEY,
    computed(() => getTicketGroups(toValue(list)))
  );
  const headerHeight = ref(0);
  provide(TICKET_HEADER_HEIGHT_KEY, headerHeight);
  useDefaultTicketLayout();
  return { headerHeight };
};

// One minute ticker shared by every row, so relative times stay fresh
// without a timer per row.
export const useTicketClock = createSharedComposable(() =>
  useNow({ interval: 60 * 1000 })
);
