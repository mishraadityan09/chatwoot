<script setup>
// FlightsMojo: the ticket table's column grid, shared by the header and every
// row so the columns line up. The tracks come from the agent's column choice
// (ticketColumns.js) through one CSS variable: a fixed checkbox track, the
// chosen columns, a fixed row-menu track. The grid never gets narrower than
// the columns' minimums (second variable): the list scrolls sideways instead,
// header and rows together. ConversationList provides the choice once;
// without a provider the defaults apply.
import { useTicketColumnsContext } from './ticketColumns';

const { gridStyle } = useTicketColumnsContext();
</script>

<template>
  <div
    class="grid items-center gap-3 px-3 [grid-template-columns:var(--fm-ticket-columns)] [min-width:var(--fm-ticket-min-width)]"
    :style="gridStyle"
  >
    <slot />
  </div>
</template>
