<script setup>
// FlightsMojo: the ticket table's column grid, shared by the header and every
// row so the columns line up. Columns (xl and up): select, status, subject,
// requester, requested, priority, group, assignee, channel, updated, actions.
// Below xl the requested, group and channel cells are `hidden`, and the
// narrower template has no tracks for them. Class strings live in this .vue
// file on purpose: Tailwind does not scan dashboard/flightsmojo/**/*.js.
</script>

<template>
  <div
    class="grid items-center gap-3 px-3 grid-cols-[1.25rem_5.5rem_minmax(0,3fr)_minmax(0,1.3fr)_5.5rem_minmax(0,1fr)_3.5rem_1.75rem] xl:grid-cols-[1.25rem_5.5rem_minmax(0,3fr)_minmax(0,1.3fr)_6.5rem_5.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_3.5rem_1.75rem]"
  >
    <slot />
  </div>
</template>
