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
import UnreadBadge from 'dashboard/components-next/Conversation/ConversationCard/UnreadBadge.vue';
import FmTicketGrid from './FmTicketGrid.vue';
import { getTicketSubject } from '../helpers/ticket';
import { priorityKey, useTicketClock, useTicketGroup } from './ticketTable';

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

const STATUS_BADGES = {
  open: {
    key: 'FLIGHTSMOJO.TICKETS.STATUS.OPEN',
    class: 'bg-n-ruby-3 text-n-ruby-11',
  },
  pending: {
    key: 'FLIGHTSMOJO.TICKETS.STATUS.PENDING',
    class: 'bg-n-amber-3 text-n-amber-11',
  },
  snoozed: {
    key: 'FLIGHTSMOJO.TICKETS.STATUS.SNOOZED',
    class: 'bg-n-slate-3 text-n-slate-11',
  },
  resolved: {
    key: 'FLIGHTSMOJO.TICKETS.STATUS.RESOLVED',
    class: 'bg-n-teal-3 text-n-teal-11',
  },
};
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

const statusBadge = computed(() => STATUS_BADGES[props.chat.status] || null);
const statusClass = computed(
  () => statusBadge.value?.class || STATUS_BADGES.snoozed.class
);
const statusLabel = computed(() =>
  statusBadge.value ? t(statusBadge.value.key) : props.chat.status
);

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
  <div
    v-if="group"
    data-test-id="ticket-group-header"
    class="flex items-center gap-2 px-3 pt-4 pb-1.5 text-xs font-520 tracking-[0.01em] text-n-slate-11 border-b border-n-weak"
  >
    <CardPriorityIcon :priority="chat.priority" show-empty />
    <span class="text-n-slate-12">{{ groupLabel }}</span>
    <span class="font-420 text-n-slate-10 tabular-nums">{{ group.count }}</span>
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

    <div class="min-w-0">
      <span
        data-test-id="ticket-status"
        class="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-460 tracking-normal truncate max-w-full"
        :class="statusClass"
      >
        {{ statusLabel }}
      </span>
    </div>

    <div class="flex items-center gap-2 min-w-0">
      <span
        data-test-id="ticket-subject"
        class="truncate min-w-0 text-sm tracking-[-0.2px]"
        :class="[
          subject ? 'text-n-slate-12' : 'text-n-slate-11',
          hasUnread ? 'font-520' : subject ? 'font-460' : 'font-420',
        ]"
        :title="subject || previewText"
      >
        {{ subject || previewText }}
      </span>
      <span
        v-if="labelChips.length"
        data-test-id="ticket-labels"
        class="flex items-center gap-1 min-w-0 max-w-[40%] flex-shrink-0"
        :title="chat.labels.join(', ')"
      >
        <span
          class="inline-flex items-center gap-1 h-5 px-1.5 min-w-0 rounded-md border border-n-weak text-xs font-440 tracking-normal text-n-slate-11"
        >
          <span
            class="size-2 rounded-sm flex-shrink-0 bg-n-slate-8"
            :style="
              labelChips[0].color
                ? { backgroundColor: labelChips[0].color }
                : undefined
            "
          />
          <span class="truncate">{{ labelChips[0].title }}</span>
        </span>
        <span
          v-if="labelChips.length > 1"
          class="flex-shrink-0 text-xs text-n-slate-10"
        >
          {{
            $t('FLIGHTSMOJO.TICKETS.MORE_LABELS', {
              count: labelChips.length - 1,
            })
          }}
        </span>
      </span>
      <UnreadBadge
        v-if="hasUnread"
        :count="chat.unread_count"
        class="flex-shrink-0 ms-auto"
      />
    </div>

    <div class="flex items-center gap-2 min-w-0">
      <Avatar
        :name="currentContact.name"
        :src="currentContact.thumbnail"
        :size="20"
        hide-offline-status
      />
      <span class="truncate text-n-slate-12 font-440 capitalize">
        {{ currentContact.name }}
      </span>
    </div>

    <div
      class="hidden xl:block truncate text-n-slate-11 tabular-nums"
      :title="requestedTitle"
    >
      {{ requestedAt }}
    </div>

    <div class="flex items-center gap-1.5 min-w-0 text-n-slate-12">
      <CardPriorityIcon v-if="chat.priority" :priority="chat.priority" />
      <span class="truncate" :class="{ 'text-n-slate-10': !chat.priority }">
        {{ priorityLabel }}
      </span>
    </div>

    <div
      class="hidden xl:block truncate capitalize"
      :class="teamName ? 'text-n-slate-11' : 'text-n-slate-10'"
    >
      {{ teamName || $t('FLIGHTSMOJO.TICKETS.EMPTY_VALUE') }}
    </div>

    <div class="flex items-center gap-2 min-w-0">
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
      <span v-else class="text-n-slate-10">
        {{ $t('FLIGHTSMOJO.TICKETS.EMPTY_VALUE') }}
      </span>
    </div>

    <div class="hidden xl:flex min-w-0">
      <InboxName v-if="showChannel" :inbox="inbox" class="min-w-0" />
    </div>

    <div class="truncate text-n-slate-11 text-end tabular-nums">
      {{ updatedAt }}
    </div>

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
