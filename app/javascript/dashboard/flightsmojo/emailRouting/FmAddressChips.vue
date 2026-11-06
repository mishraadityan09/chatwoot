<script setup>
// FlightsMojo (FM-41): a list of addresses / @domains as removable chips.
// Enter, comma, semicolon, space, Tab or leaving the field adds what was typed;
// a pasted list is split; anything that is not an address or @domain stays in
// the field with a message.
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { addEntries } from './emailRouting';

defineProps({
  label: { type: String, required: true },
  placeholder: { type: String, default: '' },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
});

const entries = defineModel({ type: Array, default: () => [] });
const { t } = useI18n();
const draft = ref('');
const error = ref('');

const commit = () => {
  if (!draft.value.trim()) {
    error.value = '';
    return;
  }
  const { list, invalid } = addEntries(entries.value, draft.value);
  entries.value = list;
  draft.value = invalid.join(' ');
  error.value = invalid.length
    ? t('FLIGHTSMOJO.EMAIL_ROUTING.INVALID_ENTRY', {
        entries: invalid.join(', '),
      })
    : '';
};

const remove = entry => {
  entries.value = entries.value.filter(item => item !== entry);
};

const onKeydown = event => {
  if (
    ['Enter', ',', ';', ' ', 'Tab'].includes(event.key) &&
    draft.value.trim()
  ) {
    event.preventDefault();
    commit();
  } else if (
    event.key === 'Backspace' &&
    !draft.value &&
    entries.value.length
  ) {
    entries.value = entries.value.slice(0, -1);
  }
};
</script>

<template>
  <div class="flex flex-col gap-1">
    <span class="text-xs font-medium text-n-slate-11">{{ label }}</span>
    <div
      class="flex flex-wrap items-center gap-1.5 min-h-9 px-2 py-1.5 rounded-lg outline outline-1 -outline-offset-1 outline-n-weak bg-n-alpha-black2 focus-within:outline-n-brand"
      :class="{ 'opacity-60 pointer-events-none': disabled }"
    >
      <span
        v-for="entry in entries"
        :key="entry"
        class="inline-flex items-center gap-1 h-6 ltr:pl-2 ltr:pr-1 rtl:pr-2 rtl:pl-1 rounded-md bg-n-alpha-2 text-[13px] text-n-slate-12"
      >
        {{ entry }}
        <button
          type="button"
          class="inline-flex items-center justify-center size-4 rounded text-n-slate-10 hover:text-n-slate-12"
          :aria-label="t('FLIGHTSMOJO.EMAIL_ROUTING.REMOVE_ENTRY', { entry })"
          @click="remove(entry)"
        >
          <span class="i-lucide-x size-3" />
        </button>
      </span>
      <input
        v-model="draft"
        type="text"
        class="reset-base flex-1 min-w-[10rem] h-6 !mb-0 p-0 border-0 rounded-none outline-none outline-0 bg-transparent dark:bg-transparent text-[13px] text-n-slate-12 placeholder:text-n-slate-10"
        :placeholder="entries.length ? '' : placeholder"
        :aria-label="label"
        :disabled="disabled"
        @keydown="onKeydown"
        @blur="commit"
      />
    </div>
    <span v-if="error" class="text-xs text-n-ruby-11">{{ error }}</span>
    <span v-else-if="hint" class="text-xs text-n-slate-10">{{ hint }}</span>
  </div>
</template>
