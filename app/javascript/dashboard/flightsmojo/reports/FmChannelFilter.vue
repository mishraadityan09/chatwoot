<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMapGetter } from 'dashboard/composables/store';
import ComboBox from 'dashboard/components-next/combobox/ComboBox.vue';
import { ALL_CHANNELS, channelOptions, toInboxId } from './channelFilter';

// FlightsMojo: channel (inbox) picker for the agents summary report.
// v-model is the inbox id, or null for all channels.
const props = defineProps({
  modelValue: {
    type: Number,
    default: null,
  },
});

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();
const inboxes = useMapGetter('inboxes/getInboxes');

const options = computed(() =>
  channelOptions(inboxes.value || [], t('FLIGHTSMOJO.REPORTS.CHANNEL.ALL'))
);
const selected = computed(() => props.modelValue ?? ALL_CHANNELS);

const onSelect = value => {
  const inboxId = toInboxId(value);
  if (inboxId !== props.modelValue) emit('update:modelValue', inboxId);
};
</script>

<template>
  <div class="w-full md:w-60" data-test-id="fm-channel-filter">
    <ComboBox
      :model-value="selected"
      :options="options"
      :placeholder="$t('FLIGHTSMOJO.REPORTS.CHANNEL.ALL')"
      :search-placeholder="$t('FLIGHTSMOJO.REPORTS.CHANNEL.SEARCH')"
      :empty-state="$t('FLIGHTSMOJO.REPORTS.CHANNEL.EMPTY')"
      @update:model-value="onSelect"
    />
  </div>
</template>
