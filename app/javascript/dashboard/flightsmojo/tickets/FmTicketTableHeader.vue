<script setup>
// FlightsMojo: sticky header of the ticket table: a summary line
// ("12 of 138 tickets · Updated just now") and the column titles, on the same
// grid as FmTicketRow. Rendered by ConversationList in the expanded layout.
import { computed, inject, onBeforeUnmount, useTemplateRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';
import FmTicketGrid from './FmTicketGrid.vue';
import { TICKET_HEADER_HEIGHT_KEY, useTicketClock } from './ticketTable';

const props = defineProps({
  loadedCount: { type: Number, default: 0 },
  // Folder (saved filter) views: the stats count is the folder's total.
  foldersId: { type: [String, Number], default: 0 },
});

const { t } = useI18n();

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
      class="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5 text-xs font-420 text-n-slate-10"
    >
      <span data-test-id="ticket-summary" class="truncate tabular-nums">{{
        summary
      }}</span>
      <span data-test-id="ticket-updated" class="flex-shrink-0">{{
        updated
      }}</span>
    </div>
    <FmTicketGrid
      class="h-8 text-xs font-520 tracking-[0.01em] text-n-slate-10 border-y border-n-weak"
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
