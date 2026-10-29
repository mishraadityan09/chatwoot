<script setup>
// FlightsMojo: the compact label cell of the ticket table — the first label as
// a chip, then "+N", the full list on hover. Used inside the Subject cell when
// the Labels column is hidden, and by the Labels column itself.
defineProps({
  // [{ title, color }]
  chips: { type: Array, required: true },
});
</script>

<template>
  <span
    v-if="chips.length"
    data-test-id="ticket-labels"
    class="flex items-center gap-1 min-w-0"
    :title="chips.map(chip => chip.title).join(', ')"
  >
    <span
      class="inline-flex items-center gap-1 h-5 px-1.5 min-w-0 rounded-md border border-n-weak text-xs font-440 tracking-normal text-n-slate-11"
    >
      <span
        class="size-2 rounded-sm flex-shrink-0 bg-n-slate-8"
        :style="
          chips[0].color ? { backgroundColor: chips[0].color } : undefined
        "
      />
      <span class="truncate">{{ chips[0].title }}</span>
    </span>
    <span v-if="chips.length > 1" class="flex-shrink-0 text-xs text-n-slate-10">
      {{ $t('FLIGHTSMOJO.TICKETS.MORE_LABELS', { count: chips.length - 1 }) }}
    </span>
  </span>
</template>
