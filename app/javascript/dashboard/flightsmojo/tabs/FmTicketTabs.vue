<script setup>
// FlightsMojo: the ticket tab bar above every dashboard page (Zendesk's top
// bar). Rendered by Dashboard.vue; hidden until a ticket has been opened and
// on small screens. State and behaviour live in useTicketTabs.
import { useI18n } from 'vue-i18n';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useTicketTabs } from './useTicketTabs';

const { t } = useI18n();
const { tabs, activeId, isOnList, open, close, openViews, info } =
  useTicketTabs();

const STATUS_DOT = {
  open: 'bg-n-ruby-9',
  pending: 'bg-n-amber-9',
  snoozed: 'bg-n-slate-9',
  resolved: 'bg-n-teal-9',
};

const labelOf = tab => info(tab.id)?.name || t('FLIGHTSMOJO.TABS.TICKET');
const titleOf = tab =>
  [
    labelOf(tab),
    t('FLIGHTSMOJO.TABS.ID', { id: tab.id }),
    info(tab.id)?.subject,
  ]
    .filter(Boolean)
    .join(' · ');
const dotOf = tab => STATUS_DOT[info(tab.id)?.status] || 'bg-n-slate-7';
const isUnread = tab => !!info(tab.id)?.unread;

// Middle click closes, like browser tabs.
const onAuxClick = (event, tab) => {
  if (event.button === 1) close(tab.id);
};
</script>

<template>
  <div
    v-if="tabs.length"
    data-test-id="ticket-tabs"
    role="tablist"
    :aria-label="t('FLIGHTSMOJO.TABS.LABEL')"
    class="hidden md:flex items-center gap-1 h-10 px-2 flex-shrink-0 border-b border-n-weak bg-n-background overflow-x-auto [scrollbar-width:none]"
  >
    <button
      type="button"
      role="tab"
      data-test-id="ticket-tab-views"
      :aria-selected="isOnList"
      class="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[13px] font-460 flex-shrink-0"
      :class="
        isOnList
          ? 'bg-n-solid-1 text-n-slate-12 font-medium shadow-sm'
          : 'text-n-slate-11 hover:bg-n-alpha-2'
      "
      @click="openViews"
    >
      <Icon icon="i-lucide-layout-list" class="size-4" />
      {{ t('FLIGHTSMOJO.TABS.VIEWS') }}
    </button>
    <div class="w-px h-4 mx-1 bg-n-strong flex-shrink-0" />
    <div
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      data-test-id="ticket-tab"
      :aria-selected="tab.id === activeId"
      :title="titleOf(tab)"
      class="group flex items-center gap-1.5 h-7 ps-2.5 pe-1 rounded-md text-[13px] font-440 tracking-[-0.13px] max-w-52 min-w-0 flex-shrink-0 cursor-pointer select-none"
      :class="
        tab.id === activeId
          ? 'bg-n-solid-1 text-n-slate-12 shadow-sm'
          : 'text-n-slate-11 hover:bg-n-alpha-2'
      "
      @click="open(tab)"
      @mousedown.middle.prevent
      @auxclick="onAuxClick($event, tab)"
    >
      <span class="size-2 rounded-full flex-shrink-0" :class="dotOf(tab)" />
      <span
        class="truncate"
        :class="
          isUnread(tab) || tab.id === activeId ? 'font-520 text-n-slate-12' : ''
        "
      >
        {{ labelOf(tab) }}
      </span>
      <span class="text-xs text-n-slate-10 flex-shrink-0 tabular-nums">
        {{ t('FLIGHTSMOJO.TABS.ID', { id: tab.id }) }}
      </span>
      <button
        type="button"
        data-test-id="ticket-tab-close"
        class="flex items-center justify-center size-5 p-0 rounded flex-shrink-0 text-n-slate-11 hover:bg-n-alpha-2 hover:text-n-slate-12"
        :aria-label="t('FLIGHTSMOJO.TABS.CLOSE')"
        @click.stop="close(tab.id)"
      >
        <Icon icon="i-lucide-x" class="size-3.5 flex-shrink-0" />
      </button>
    </div>
  </div>
  <span v-else class="hidden" />
</template>
