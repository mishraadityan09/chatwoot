<script setup>
// FlightsMojo: sticky header of the ticket table: a summary line
// ("12 of 138 tickets · Updated just now") and the column titles, on the same
// grid as FmTicketRow. Rendered by ConversationList in the expanded layout.
// The titles follow the agent's column choice (FM-33). A click on a sortable
// title sorts the whole list server-side the way the sort menu does, and the
// title shows the direction (FM-34).
import { computed, inject, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';
import { useI18n } from 'vue-i18n';
import { useMapGetter, useStore } from 'dashboard/composables/store';
import { useUISettings } from 'dashboard/composables/useUISettings';
import { dynamicTime, shortTimestamp } from 'shared/helpers/timeHelper';
import wootConstants from 'dashboard/constants/globals';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import FmTicketGrid from './FmTicketGrid.vue';
import { TICKET_HEADER_HEIGHT_KEY, useTicketClock } from './ticketTable';
import {
  activeSortFor,
  sortKeyFor,
  useTicketColumnsContext,
} from './ticketColumns';

const props = defineProps({
  loadedCount: { type: Number, default: 0 },
  // Folder (saved filter) views: the stats count is the folder's total.
  foldersId: { type: [String, Number], default: 0 },
});

const emit = defineEmits(['sort']);

const { t } = useI18n();
const store = useStore();
const { updateUISettings } = useUISettings();
const { columns, gridStyle } = useTicketColumnsContext();

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

// When the table is wider than the list and scrolls sideways, the summary
// line keeps the list's own width and sticks to the left edge, so "n tickets
// shown" and "Updated …" stay in view.
const scrollContainer = computed(() => tableHeader.value?.parentElement);
const listWidth = ref(0);
useResizeObserver(scrollContainer, entries => {
  listWidth.value = Math.round(entries[0]?.contentRect?.width || 0);
});
const summaryStyle = computed(() =>
  listWidth.value ? { width: `${listWidth.value}px` } : undefined
);
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

// ── Column sort ──
const chatSortFilter = useMapGetter('getChatSortFilter');
const chatStatusFilter = useMapGetter('getChatStatusFilter');
const activeSort = computed(() => activeSortFor(chatSortFilter.value));

const columnLabel = column =>
  t(`FLIGHTSMOJO.TICKETS.COLUMNS.${column.labelKey}`);
const isSortedBy = column =>
  !!column.sort && activeSort.value?.sort === column.sort;
const ariaSort = column => {
  if (!isSortedBy(column)) return undefined;
  return activeSort.value.direction === 'asc' ? 'ascending' : 'descending';
};
const sortIcon = () =>
  activeSort.value?.direction === 'asc'
    ? 'i-lucide-arrow-up'
    : 'i-lucide-arrow-down';

// Same three steps as the sort menu (ConversationBasicFilter): the store for
// this session, the UI settings for next time, then ChatList refetches.
const onSort = column => {
  const sortBy = sortKeyFor(column, activeSort.value);
  if (!sortBy) return;
  store.dispatch('setChatSortFilter', sortBy);
  updateUISettings({
    conversations_filter_by: {
      status: chatStatusFilter.value || wootConstants.STATUS_TYPE.OPEN,
      order_by: sortBy,
    },
  });
  emit('sort', sortBy);
};
</script>

<template>
  <div
    ref="tableHeader"
    data-test-id="ticket-table-header"
    class="sticky top-0 z-20 bg-n-surface-1 [min-width:var(--fm-ticket-min-width)]"
    :style="gridStyle"
  >
    <div
      class="sticky left-0 flex items-center justify-between gap-3 px-3 pt-2 pb-1.5 text-xs font-420 text-n-slate-10"
      :style="summaryStyle"
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
      <template v-for="column in columns" :key="column.key">
        <button
          v-if="column.sort"
          type="button"
          :data-test-id="`ticket-column-${column.key}`"
          class="flex items-center gap-1 h-full min-w-0 p-0 text-xs font-520 text-start hover:text-n-slate-12 focus-visible:text-n-slate-12 focus-visible:outline-none"
          :class="{
            'justify-end text-end': column.align === 'end',
            'text-n-slate-12': isSortedBy(column),
          }"
          :aria-sort="ariaSort(column)"
          :title="
            $t('FLIGHTSMOJO.TICKETS.SORT_BY_COLUMN', {
              column: columnLabel(column),
            })
          "
          @click="onSort(column)"
        >
          <span class="truncate">{{ columnLabel(column) }}</span>
          <Icon
            v-if="isSortedBy(column)"
            data-test-id="ticket-sort-icon"
            :icon="sortIcon()"
            class="size-3 flex-shrink-0"
          />
        </button>
        <span
          v-else
          :data-test-id="`ticket-column-${column.key}`"
          class="truncate"
          :class="{ 'text-end': column.align === 'end' }"
        >
          {{ columnLabel(column) }}
        </span>
      </template>
      <span />
    </FmTicketGrid>
  </div>
</template>
