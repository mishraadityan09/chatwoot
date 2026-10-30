<script setup>
// FlightsMojo: the ticket tab bar above every dashboard page (Zendesk's top
// bar). Rendered by Dashboard.vue; hidden until a ticket has been opened and
// on small screens. State and behaviour live in useTicketTabs.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useTicketTabs } from './useTicketTabs';
import { statusDotClass } from '../helpers/status';

const { t } = useI18n();
const { tabs, activeId, isOnList, open, close, openViews, info } =
  useTicketTabs();

const labelOf = tab => info(tab.id)?.name || t('FLIGHTSMOJO.TABS.TICKET');
const titleOf = tab =>
  [
    labelOf(tab),
    t('FLIGHTSMOJO.TABS.ID', { id: tab.id }),
    info(tab.id)?.subject,
  ]
    .filter(Boolean)
    .join(' · ');
const dotOf = tab => statusDotClass(info(tab.id)?.status);
const isUnread = tab => !!info(tab.id)?.unread;

// Middle click closes, like browser tabs.
const onAuxClick = (event, tab) => {
  if (event.button === 1) close(tab.id);
};

// The bar scrolls sideways with its scrollbar hidden, which left mouse users
// stranded once the tabs overflowed (a trackpad can swipe, a wheel cannot).
// Chrome's answer, copied here: the wheel scrolls the bar, the active tab
// slides into view, and arrows appear at both ends while the tabs overflow.
const scroller = ref(null);
const overflows = ref(false);
const atStart = ref(true);
const atEnd = ref(true);

const measure = () => {
  const el = scroller.value;
  if (!el) return;
  const extra = el.scrollWidth - el.clientWidth;
  overflows.value = extra > 1;
  atStart.value = el.scrollLeft <= 0;
  atEnd.value = el.scrollLeft >= extra - 1;
};

const scrollBarBy = delta => {
  const el = scroller.value;
  if (!el) return;
  if (typeof el.scrollBy === 'function') {
    el.scrollBy({ left: delta, behavior: 'smooth' });
  } else {
    el.scrollLeft += delta;
  }
};
const pageWidth = () =>
  Math.max(120, Math.round((scroller.value?.clientWidth || 0) * 0.6));
const scrollTabsLeft = () => scrollBarBy(-pageWidth());
const scrollTabsRight = () => scrollBarBy(pageWidth());

// A plain mouse wheel only reports vertical movement; turn it into sideways
// travel while the bar overflows. Trackpads send deltaX and keep their own.
const onWheel = event => {
  const el = scroller.value;
  if (!el || !overflows.value) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  el.scrollLeft += event.deltaY;
  event.preventDefault();
};

const revealActiveTab = async () => {
  await nextTick();
  measure();
  const el = scroller.value?.querySelector(
    '[role="tab"][aria-selected="true"]'
  );
  el?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
};
watch(activeId, revealActiveTab);
watch(() => tabs.value.length, revealActiveTab);
// Names arrive after the tabs render and widen them, so reveal once more then.
watch(
  () => tabs.value.map(tab => labelOf(tab)).join('\u0000'),
  revealActiveTab
);

// The bar exists only once a tab is open, so observe the element when it
// appears; a page loaded straight onto a ticket also needs its tab revealed.
let observer = null;
watch(scroller, el => {
  observer?.disconnect();
  observer = null;
  if (el && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure);
    observer.observe(el);
  }
  if (el) revealActiveTab();
  else measure();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div
    v-if="tabs.length"
    data-test-id="ticket-tabs"
    class="hidden md:flex items-center h-10 px-2 flex-shrink-0 border-b border-n-weak bg-n-background"
  >
    <button
      v-if="overflows"
      type="button"
      data-test-id="ticket-tabs-scroll-left"
      class="flex items-center justify-center size-6 p-0 me-1 rounded flex-shrink-0 text-n-slate-11 hover:bg-n-alpha-2 hover:text-n-slate-12 disabled:opacity-30 disabled:hover:bg-transparent"
      :disabled="atStart"
      :aria-label="t('FLIGHTSMOJO.TABS.SCROLL_LEFT')"
      @click="scrollTabsLeft"
    >
      <Icon icon="i-lucide-chevron-left" class="size-4 flex-shrink-0" />
    </button>
    <div
      ref="scroller"
      role="tablist"
      :aria-label="t('FLIGHTSMOJO.TABS.LABEL')"
      class="flex items-center gap-1 h-full min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      @wheel="onWheel"
      @scroll.passive="measure"
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
            isUnread(tab) || tab.id === activeId
              ? 'font-520 text-n-slate-12'
              : ''
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
    <button
      v-if="overflows"
      type="button"
      data-test-id="ticket-tabs-scroll-right"
      class="flex items-center justify-center size-6 p-0 ms-1 rounded flex-shrink-0 text-n-slate-11 hover:bg-n-alpha-2 hover:text-n-slate-12 disabled:opacity-30 disabled:hover:bg-transparent"
      :disabled="atEnd"
      :aria-label="t('FLIGHTSMOJO.TABS.SCROLL_RIGHT')"
      @click="scrollTabsRight"
    >
      <Icon icon="i-lucide-chevron-right" class="size-4 flex-shrink-0" />
    </button>
  </div>
  <span v-else class="hidden" />
</template>
