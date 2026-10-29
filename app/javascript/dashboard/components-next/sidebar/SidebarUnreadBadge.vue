<script setup>
import { computed } from 'vue';

const props = defineProps({
  count: { type: [Number, String], default: 0 },
});

const normalizedCount = computed(() => {
  const count = Number(props.count);
  return Number.isFinite(count) && count > 0 ? count : 0;
});

// FlightsMojo: exact counts like Zendesk's views (upstream caps at 99+); the
// cap only guards the pill's width.
const displayCount = computed(() =>
  normalizedCount.value > 9999 ? '9999+' : String(normalizedCount.value)
);
</script>

<template>
  <span
    v-if="normalizedCount > 0"
    data-test-id="sidebar-unread-badge"
    class="inline-grid h-5 min-w-5 place-items-center rounded-full bg-n-slate-4 px-1 text-xxs font-medium leading-3 text-n-slate-12 dark:bg-n-slate-5 flex-shrink-0"
  >
    {{ displayCount }}
  </span>
  <span v-else class="hidden" />
</template>
