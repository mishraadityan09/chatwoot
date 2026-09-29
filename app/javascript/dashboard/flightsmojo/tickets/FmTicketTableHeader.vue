<script setup>
// FlightsMojo: sticky header of the ticket table: a summary line
// ("12 of 138 tickets · Updated just now") and the column titles, on the same
// grid as FmTicketRow. Rendered by ConversationList in the expanded layout.
import { computed, inject, onBeforeUnmount, useTemplateRef, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';
import Button from 'dashboard/components-next/button/Button.vue';
import FmTicketGrid from './FmTicketGrid.vue';
import { usePlayQueue } from '../play/usePlayQueue';
import { TICKET_HEADER_HEIGHT_KEY, useTicketClock } from './ticketTable';

const props = defineProps({
  loadedCount: { type: Number, default: 0 },
  // Folder (saved filter) views: the stats count is the folder's total.
  foldersId: { type: [String, Number], default: 0 },
});

const { t } = useI18n();
const route = useRoute();
const { isPlaying, play, leave } = usePlayQueue();

// Back on the list (no ticket open) ends Play mode, giving back a ticket
// Play claimed if the agent left it untouched.
watch(
  () => route.params.conversation_id ?? route.params.conversationId,
  id => {
    if (!id && isPlaying.value) leave();
  }
);

// Report our height to ConversationList for the Virtualizer's start-margin.
const headerHeight = inject(TICKET_HEADER_HEIGHT_KEY, null);
const tableHeader = useTemplateRef('tableHeader');
useResizeObserver(tableHeader, () => {
  if (headerHeight && tableHeader.value) {
    headerHeight.value = tableHeader.value.offsetHeight;
  }
});
onBeforeUnmount(() => {
  if (headerHeight) headerHeight.value = 0;
});
const now = useTicketClock();
const stats = useMapGetter('conversationStats/getStats');

const summary = computed(() => {
  const total = stats.value?.allCount;
  if (props.foldersId && Number.isFinite(total)) {
    return t('FLIGHTSMOJO.TICKETS.SUMMARY.FOLDER', {
      loaded: props.loadedCount,
      total,
    });
  }
  return t('FLIGHTSMOJO.TICKETS.SUMMARY.LOADED', { count: props.loadedCount });
});

const updated = computed(() => {
  const updatedOn = stats.value?.updatedOn;
  if (!(updatedOn instanceof Date) || !now.value) return '';
  if (now.value - updatedOn < 60 * 1000) {
    return t('FLIGHTSMOJO.TICKETS.UPDATED_JUST_NOW');
  }
  const seconds = Math.floor(updatedOn.getTime() / 1000);
  return t('FLIGHTSMOJO.TICKETS.UPDATED_AGO', {
    time: shortTimestamp(dynamicTime(seconds), true),
  });
});
</script>

<template>
  <div
    ref="tableHeader"
    data-test-id="ticket-table-header"
    class="sticky top-0 z-20 bg-n-surface-1"
  >
    <div
      class="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5 text-xs text-n-slate-11"
    >
      <span data-test-id="ticket-summary" class="truncate">{{ summary }}</span>
      <div class="flex items-center gap-3 flex-shrink-0">
        <span data-test-id="ticket-updated">{{ updated }}</span>
        <Button
          v-tooltip.bottom="t('FLIGHTSMOJO.PLAY.START_TOOLTIP')"
          data-test-id="ticket-play"
          size="xs"
          icon="i-lucide-play"
          :label="t('FLIGHTSMOJO.PLAY.START')"
          :disabled="!loadedCount"
          @click="play"
        />
      </div>
    </div>
    <FmTicketGrid
      class="h-8 text-xs font-medium text-n-slate-11 border-y border-n-weak"
    >
      <span />
      <span class="truncate">{{
        $t('FLIGHTSMOJO.TICKETS.COLUMNS.STATUS')
      }}</span>
      <span class="truncate">{{
        $t('FLIGHTSMOJO.TICKETS.COLUMNS.SUBJECT')
      }}</span>
      <span class="truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.REQUESTER') }}
      </span>
      <span class="hidden xl:block truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.REQUESTED') }}
      </span>
      <span class="truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.PRIORITY') }}
      </span>
      <span class="hidden xl:block truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.GROUP') }}
      </span>
      <span class="truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.ASSIGNEE') }}
      </span>
      <span class="hidden xl:block truncate">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.CHANNEL') }}
      </span>
      <span class="truncate text-end">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS.UPDATED') }}
      </span>
      <span />
    </FmTicketGrid>
  </div>
</template>
