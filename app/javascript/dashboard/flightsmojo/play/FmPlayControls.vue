<script setup>
// FlightsMojo: Play-mode controls on an open ticket ("12 left · Stop ·
// Next ticket"). Rendered by ConversationHeader; shows nothing unless Play is
// running (started from the ticket table header).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'dashboard/components-next/button/Button.vue';
import { usePlayQueue } from './usePlayQueue';

const props = defineProps({
  conversationId: { type: [Number, String], default: null },
});

const { t } = useI18n();
const { isPlaying, isLoadingNext, next, stop, remainingCount } = usePlayQueue();
const remaining = computed(() => remainingCount(props.conversationId));
</script>

<template>
  <div
    v-if="isPlaying"
    data-test-id="play-controls"
    class="flex items-center gap-2 flex-shrink-0"
  >
    <span
      data-test-id="play-remaining"
      class="text-xs text-n-slate-11 whitespace-nowrap"
    >
      {{ t('FLIGHTSMOJO.PLAY.REMAINING', { count: remaining }) }}
    </span>
    <Button
      data-test-id="play-stop"
      size="sm"
      variant="ghost"
      color="slate"
      icon="i-lucide-square"
      :label="t('FLIGHTSMOJO.PLAY.STOP')"
      @click="stop"
    />
    <Button
      data-test-id="play-next"
      size="sm"
      icon="i-lucide-skip-forward"
      :label="t('FLIGHTSMOJO.PLAY.NEXT')"
      :is-loading="isLoadingNext"
      :disabled="isLoadingNext"
      @click="next(conversationId)"
    />
  </div>
  <span v-else class="hidden" />
</template>
