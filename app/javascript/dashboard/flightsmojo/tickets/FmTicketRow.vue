<script setup>
// FlightsMojo: one row of the Zendesk-style ticket table. Stands in for
// upstream's ConversationCardExpanded (ConversationItem.vue imports this file
// under that name), so it takes the same props and emits the same events;
// selection, the context menu, opening the ticket and Alt+J/K all stay
// upstream's. The root keeps the `conversation` / `active` classes that the
// keyboard navigation looks for.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { getLastMessage } from 'dashboard/helper/conversationHelper';
import { useMessageFormatter } from 'shared/composables/useMessageFormatter';
import {
  dateFormat,
  dynamicTime,
  shortTimestamp,
} from 'shared/helpers/timeHelper';
import Avatar from 'next/avatar/Avatar.vue';
import Checkbox from 'dashboard/components-next/checkbox/Checkbox.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import InboxName from 'dashboard/components-next/Conversation/InboxName.vue';
import CardPriorityIcon from 'dashboard/components-next/Conversation/ConversationCard/CardPriorityIcon.vue';
import FmTicketGrid from './FmTicketGrid.vue';
import FmTicketLabelChips from './FmTicketLabelChips.vue';
import {
  formatShortDuration,
  getBookingId,
  getTicketSubject,
} from '../helpers/ticket';
import { priorityKey, useTicketClock, useTicketGroup } from './ticketTable';
import { statusDotClass, statusLabelKey } from '../helpers/status';
import { useTicketColumnsContext } from './ticketColumns';

const props = defineProps({
  chat: { type: Object, required: true },
  currentContact: { type: Object, required: true },
  assignee: { type: Object, default: () => ({}) },
  inbox: { type: Object, default: () => ({}) },
  selected: { type: Boolean, default: false },
  isActiveChat: { type: Boolean, default: false },
  showAssignee: { type: Boolean, default: false },
  showInboxName: { type: Boolean, default: false },
  isInboxView: { type: Boolean, default: false },
});

const emit = defineEmits([
  'selectConversation',
  'deSelectConversation',
  'click',
  'contextmenu',
]);

const { t } = useI18n();
const { getPlainText } = useMessageFormatter();
const now = useTicketClock();
// The agent's columns (FM-33), provided once by ConversationList.
const { columns, keys, gridStyle } = useTicketColumnsContext();

// Status = a coloured dot + the word (a filled pill on every row was the
// loudest thing on the page).
const PRIORITY_LABEL_KEYS = {
  URGENT: 'FLIGHTSMOJO.TICKETS.PRIORITY.URGENT',
  HIGH: 'FLIGHTSMOJO.TICKETS.PRIORITY.HIGH',
  MEDIUM: 'FLIGHTSMOJO.TICKETS.PRIORITY.MEDIUM',
  LOW: 'FLIGHTSMOJO.TICKETS.PRIORITY.LOW',
  NONE: 'FLIGHTSMOJO.TICKETS.PRIORITY.NONE',
};

const group = useTicketGroup(() => props.chat.id);
const subject = computed(() => getTicketSubject(props.chat));
const hasUnread = computed(() => props.chat.unread_count > 0);
const unreadLabel = computed(() =>
  props.chat.unread_count > 99 ? '99+' : String(props.chat.unread_count)
);
const accountLabels = useMapGetter('labels/getLabels');
// Compact label cell: first label as a chip, then "+N"; all on hover.
const labelChips = computed(() =>
  (props.chat.labels || []).map(title => ({
    title,
    color: accountLabels.value?.find(label => label.title === title)?.color,
  }))
);

const previewText = computed(() => {
  const lastMessage = props.chat.messages ? getLastMessage(props.chat) : null;
  return lastMessage?.content ? getPlainText(lastMessage.content) : '';
});

// Colours and words come from helpers/status, shared with the tabs and the card.
const statusClass = computed(() => statusDotClass(props.chat.status));
const statusLabel = computed(() => {
  const key = statusLabelKey(props.chat.status);
  return key ? t(key) : props.chat.status;
});

const priorityLabel = computed(() =>
  props.chat.priority
    ? t(PRIORITY_LABEL_KEYS[priorityKey(props.chat.priority)])
    : t('FLIGHTSMOJO.TICKETS.EMPTY_VALUE')
);
const groupLabel = computed(() =>
  group.value ? t(PRIORITY_LABEL_KEYS[group.value.key]) : ''
);

// Same visibility rules as upstream's expanded card: no inbox name inside an
// inbox's own view, assignee only when the list asks for it.
const showChannel = computed(() => !props.isInboxView && props.showInboxName);
const showAssigneeName = computed(
  () => props.showAssignee && !!props.assignee.name
);

const teamName = computed(() => props.chat.meta?.team?.name || '');

const requestedAt = computed(() =>
  props.chat.created_at ? dateFormat(props.chat.created_at, 'MMM d, HH:mm') : ''
);
const requestedTitle = computed(() =>
  props.chat.created_at
    ? dateFormat(props.chat.created_at, 'MMM d, yyyy h:mm a')
    : ''
);

const updatedAt = computed(() => {
  // Re-evaluates every minute through the shared clock.
  if (!now.value || !props.chat.timestamp) return '';
  return shortTimestamp(dynamicTime(props.chat.timestamp));
});

// Labels sit in the Subject cell unless they have a column of their own.
const showLabelsInSubject = computed(() => !keys.value.includes('labels'));
const emptyValue = computed(() => t('FLIGHTSMOJO.TICKETS.EMPTY_VALUE'));
const bookingId = computed(() => getBookingId(props.chat));
const contactEmail = computed(() => props.currentContact?.email || '');
// Time from the ticket's creation to the first agent reply.
const firstResponse = computed(() => {
  const { created_at: createdAt, first_reply_created_at: repliedAt } =
    props.chat;
  if (!createdAt || !repliedAt || repliedAt < createdAt) return '';
  return formatShortDuration(repliedAt - createdAt);
});
// How long the customer has been waiting for a reply (relative, live).
const waitingSince = computed(() => {
  if (!now.value || !props.chat.waiting_since) return '';
  return shortTimestamp(dynamicTime(props.chat.waiting_since));
});

const selectedModel = computed({
  get: () => props.selected,
  set: value => {
    if (value) {
      emit('selectConversation', value);
    } else {
      emit('deSelectConversation', value);
    }
  },
});
</script>

<template>
  <!-- The band spans the table's full width (same minimum as the rows) so its
       border reaches the last column; the label inside sticks to the list's
       left edge while a wide table scrolls sideways. -->
  <div
    v-if="group"
    data-test-id="ticket-group-header"
    class="px-3 pt-4 pb-1.5 text-xs font-520 tracking-[0.01em] text-n-slate-11 border-b border-n-weak [min-width:var(--fm-ticket-min-width)]"
    :style="gridStyle"
  >
    <div class="sticky left-0 inline-flex items-center gap-2">
      <CardPriorityIcon :priority="chat.priority" show-empty />
      <span class="text-n-slate-12">{{ groupLabel }}</span>
      <span class="font-420 text-n-slate-10 tabular-nums">
        {{ group.count }}
      </span>
    </div>
  </div>
  <FmTicketGrid
    data-test-id="ticket-row"
    class="conversation relative cursor-pointer h-10 text-[13px] leading-5 font-420 tracking-[-0.13px] border-b border-n-slate-3"
    :class="{
      'active bg-n-alpha-1 dark:bg-n-alpha-3': isActiveChat,
      'selected bg-n-slate-2 dark:bg-n-slate-3': selected,
      'hover:bg-n-alpha-1 dark:hover:bg-n-alpha-3': !isActiveChat && !selected,
    }"
    @click="emit('click', $event)"
    @contextmenu="emit('contextmenu', $event)"
  >
    <div class="flex items-center justify-center" @click.stop>
      <Checkbox v-model="selectedModel" />
    </div>

    <template v-for="column in columns" :key="column.key">
      <div v-if="column.key === 'status'" class="min-w-0">
        <span
          data-test-id="ticket-status"
          class="inline-flex items-center gap-1.5 text-[13px] font-460 tracking-normal text-n-slate-11 truncate max-w-full"
        >
          <span
            data-test-id="ticket-status-dot"
            class="size-2 rounded-full flex-shrink-0"
            :class="statusClass"
          />
          {{ statusLabel }}
        </span>
      </div>

      <div
        v-else-if="column.key === 'subject'"
        class="flex items-center gap-2 min-w-0"
      >
        <span
          data-test-id="ticket-subject"
          class="truncate min-w-0 text-[13px] tracking-[-0.13px]"
          :class="[
            subject ? 'text-n-slate-12' : 'text-n-slate-11',
            hasUnread ? 'font-520' : subject ? 'font-460' : 'font-420',
          ]"
          :title="subject || previewText"
        >
          {{ subject || previewText }}
        </span>
        <FmTicketLabelChips
          v-if="showLabelsInSubject"
          :chips="labelChips"
          class="max-w-[40%] flex-shrink-0"
        />
        <span
          v-if="hasUnread"
          data-test-id="ticket-unread"
          class="flex-shrink-0 ms-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-n-blue-3 text-n-blue-11 text-[11px] font-520 tracking-normal tabular-nums"
        >
          {{ unreadLabel }}
        </span>
      </div>

      <div
        v-else-if="column.key === 'requester'"
        class="flex items-center min-w-0"
      >
        <span class="truncate text-n-slate-12 font-440 capitalize">
          {{ currentContact.name }}
        </span>
      </div>

      <div
        v-else-if="column.key === 'requested'"
        class="truncate text-n-slate-11 tabular-nums"
        :title="requestedTitle"
      >
        {{ requestedAt }}
      </div>

      <div
        v-else-if="column.key === 'priority'"
        class="flex items-center gap-1.5 min-w-0 text-n-slate-12"
      >
        <CardPriorityIcon v-if="chat.priority" :priority="chat.priority" />
        <span class="truncate" :class="{ 'text-n-slate-10': !chat.priority }">
          {{ priorityLabel }}
        </span>
      </div>

      <div
        v-else-if="column.key === 'group'"
        class="truncate capitalize"
        :class="teamName ? 'text-n-slate-11' : 'text-n-slate-10'"
      >
        {{ teamName || emptyValue }}
      </div>

      <div
        v-else-if="column.key === 'assignee'"
        class="flex items-center gap-2 min-w-0"
      >
        <template v-if="showAssigneeName">
          <Avatar
            :name="assignee.name"
            :src="assignee.thumbnail"
            :size="20"
            :status="assignee.availability_status"
            hide-offline-status
          />
          <span class="truncate text-n-slate-11">{{ assignee.name }}</span>
        </template>
        <span v-else class="text-n-slate-10">{{ emptyValue }}</span>
      </div>

      <div v-else-if="column.key === 'channel'" class="flex min-w-0">
        <!-- FlightsMojo: the shared InboxName renders 14px; the table scale is 13px -->
        <InboxName
          v-if="showChannel"
          :inbox="inbox"
          class="min-w-0 [&_span]:text-[13px]"
        />
      </div>

      <div
        v-else-if="column.key === 'updated'"
        class="truncate text-n-slate-11 text-end tabular-nums"
      >
        {{ updatedAt }}
      </div>

      <div
        v-else-if="column.key === 'id'"
        data-test-id="ticket-id"
        class="truncate text-n-slate-11 tabular-nums"
      >
        #{{ chat.id }}
      </div>

      <div
        v-else-if="column.key === 'booking_id'"
        data-test-id="ticket-booking-id"
        class="truncate tabular-nums"
        :class="bookingId ? 'text-n-slate-12' : 'text-n-slate-10'"
      >
        {{ bookingId || emptyValue }}
      </div>

      <div
        v-else-if="column.key === 'labels'"
        data-test-id="ticket-labels-column"
        class="flex items-center min-w-0"
      >
        <FmTicketLabelChips v-if="labelChips.length" :chips="labelChips" />
        <span v-else class="text-n-slate-10">{{ emptyValue }}</span>
      </div>

      <div
        v-else-if="column.key === 'email'"
        data-test-id="ticket-email"
        class="truncate"
        :class="contactEmail ? 'text-n-slate-11' : 'text-n-slate-10'"
        :title="contactEmail"
      >
        {{ contactEmail || emptyValue }}
      </div>

      <div
        v-else-if="column.key === 'first_response'"
        data-test-id="ticket-first-response"
        class="truncate text-end tabular-nums"
        :class="firstResponse ? 'text-n-slate-11' : 'text-n-slate-10'"
      >
        {{ firstResponse || emptyValue }}
      </div>

      <div
        v-else-if="column.key === 'waiting_since'"
        data-test-id="ticket-waiting-since"
        class="truncate text-end tabular-nums"
        :class="waitingSince ? 'text-n-slate-11' : 'text-n-slate-10'"
      >
        {{ waitingSince || emptyValue }}
      </div>
    </template>

    <div class="flex items-center justify-end">
      <button
        type="button"
        class="flex items-center justify-center size-7 p-0 rounded-md text-n-slate-11 hover:bg-n-alpha-2 hover:text-n-slate-12"
        :aria-label="$t('FLIGHTSMOJO.TICKETS.ROW_ACTIONS')"
        @click.stop="emit('contextmenu', $event)"
      >
        <Icon icon="i-lucide-ellipsis-vertical" class="size-4 flex-shrink-0" />
      </button>
    </div>
  </FmTicketGrid>
</template>
