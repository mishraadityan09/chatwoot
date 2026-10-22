<script setup>
// FlightsMojo (FM-33): the "Columns" menu of the ticket table — tick a column
// to show it, drag to reorder, reset to the defaults. Saved per agent through
// ticketColumns.js. Subject cannot be hidden. Sits in ChatListHeader next to
// the sort menu, which it mirrors in look.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { vOnClickOutside } from '@vueuse/components';
import Draggable from 'vuedraggable';
import NextButton from 'dashboard/components-next/button/Button.vue';
import Checkbox from 'dashboard/components-next/checkbox/Checkbox.vue';
import Icon from 'dashboard/components-next/icon/Icon.vue';
import { useTicketColumns } from './ticketColumns';

defineProps({
  isOnExpandedLayout: { type: Boolean, default: true },
});

const { t } = useI18n();
// A plain ref rather than vueuse's useToggle: under vitest the latter's ref
// comes from a second Vue copy and never re-renders the menu.
const isOpen = ref(false);
const toggle = (value = !isOpen.value) => {
  isOpen.value = value;
};
const { columns, hiddenColumns, isDefault, toggleColumn, reorder, reset } =
  useTicketColumns();

// Draggable wants a list it can hand back reordered; the saved order is the
// source of truth, so the setter saves and the getter re-reads.
const visibleColumns = computed({
  get: () => [...columns.value],
  set: list => reorder(list.map(column => column.key)),
});

const label = column => t(`FLIGHTSMOJO.TICKETS.COLUMNS.${column.labelKey}`);
</script>

<template>
  <div class="relative flex">
    <NextButton
      v-tooltip.top-end="$t('FLIGHTSMOJO.TICKETS.COLUMNS_MENU.BUTTON')"
      data-test-id="ticket-columns-button"
      :aria-label="$t('FLIGHTSMOJO.TICKETS.COLUMNS_MENU.BUTTON')"
      icon="i-lucide-columns-3"
      slate
      faded
      xs
      @click="toggle()"
    />
    <div
      v-if="isOpen"
      v-on-click-outside="() => toggle(false)"
      data-test-id="ticket-columns-menu"
      class="mt-1 bg-n-alpha-3 backdrop-blur-[100px] border border-n-weak w-64 rounded-xl p-3 absolute z-40 top-full"
      :class="{
        'ltr:left-0 rtl:right-0': !isOnExpandedLayout,
        'ltr:right-0 rtl:left-0': isOnExpandedLayout,
      }"
    >
      <div class="flex items-center justify-between gap-2 mb-1">
        <span class="text-sm font-medium text-n-slate-12 truncate">
          {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS_MENU.TITLE') }}
        </span>
        <button
          v-if="!isDefault"
          type="button"
          data-test-id="ticket-columns-reset"
          class="p-0 text-xs text-n-slate-11 hover:text-n-slate-12 hover:underline flex-shrink-0"
          @click="reset()"
        >
          {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS_MENU.RESET') }}
        </button>
      </div>
      <p class="m-0 mb-2 text-xs text-n-slate-10">
        {{ $t('FLIGHTSMOJO.TICKETS.COLUMNS_MENU.HINT') }}
      </p>
      <Draggable
        v-model="visibleColumns"
        item-key="key"
        handle=".fm-column-handle"
        animation="150"
        ghost-class="opacity-40"
        tag="ul"
        class="m-0 p-0 list-none"
      >
        <template #item="{ element }">
          <li
            :data-test-id="`ticket-columns-item-${element.key}`"
            class="flex items-center gap-2 h-8 px-1 rounded-md hover:bg-n-alpha-2"
          >
            <Icon
              icon="i-lucide-grip-vertical"
              class="fm-column-handle size-3.5 flex-shrink-0 text-n-slate-9 cursor-grab"
            />
            <Checkbox
              model-value
              :disabled="!!element.required"
              @update:model-value="toggleColumn(element.key)"
            />
            <span class="text-[13px] text-n-slate-12 truncate">
              {{ label(element) }}
            </span>
          </li>
        </template>
      </Draggable>
      <ul
        v-if="hiddenColumns.length"
        class="m-0 mt-1 pt-1 p-0 list-none border-t border-n-weak"
      >
        <li
          v-for="column in hiddenColumns"
          :key="column.key"
          :data-test-id="`ticket-columns-item-${column.key}`"
          class="flex items-center gap-2 h-8 px-1 rounded-md hover:bg-n-alpha-2"
        >
          <span class="size-3.5 flex-shrink-0" />
          <Checkbox
            :model-value="false"
            @update:model-value="toggleColumn(column.key)"
          />
          <span class="text-[13px] text-n-slate-11 truncate">
            {{ label(column) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
