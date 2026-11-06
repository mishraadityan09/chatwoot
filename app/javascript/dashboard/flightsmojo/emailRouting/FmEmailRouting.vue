<script setup>
// FlightsMojo (FM-41): Settings → Email Routing. An ordered list of email
// inboxes; a new mail goes to the first one that matches (its own address on
// the mail, a listed sender, or a listed To/Cc address). The checker asks the
// server where a mail would go under the rules on screen, before saving.
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlert } from 'dashboard/composables';
import NextButton from 'dashboard/components-next/button/Button.vue';
import ComboBox from 'dashboard/components-next/combobox/ComboBox.vue';
import Input from 'dashboard/components-next/input/Input.vue';
import EmailRoutesAPI from 'dashboard/api/emailRoutes';
import FmAddressChips from './FmAddressChips.vue';
import {
  availableInboxes,
  moveRule,
  sameRules,
  toPayload,
} from './emailRouting';

const { t } = useI18n();

const isLoading = ref(true);
const isSaving = ref(false);
const loadFailed = ref(false);
const inboxes = ref([]);
const rules = ref([]);
const savedRules = ref([]);
const changed = ref(null);
const errors = ref([]);
const inboxToAdd = ref('');

const checkFrom = ref('');
const checkTo = ref('');
const isChecking = ref(false);
const checkResult = ref(null);

const inboxById = computed(() =>
  Object.fromEntries(inboxes.value.map(inbox => [inbox.id, inbox]))
);
const addOptions = computed(() =>
  availableInboxes(inboxes.value, rules.value).map(inbox => ({
    value: inbox.id,
    label: inbox.email ? `${inbox.name} (${inbox.email})` : inbox.name,
  }))
);
const isDirty = computed(() => !sameRules(rules.value, savedRules.value));
const changedText = computed(() => {
  if (!changed.value?.at) return '';
  return t('FLIGHTSMOJO.EMAIL_ROUTING.LAST_CHANGED', {
    name: changed.value.by || '—',
    time: new Date(changed.value.at).toLocaleString(),
  });
});

const applyPayload = data => {
  inboxes.value = data.inboxes || [];
  const list = (data.rules || []).map(rule => ({
    inbox_id: rule.inbox_id,
    senders: [...(rule.senders || [])],
    recipients: [...(rule.recipients || [])],
  }));
  rules.value = list;
  savedRules.value = toPayload(list);
  changed.value = data.changed || null;
};

const load = async () => {
  isLoading.value = true;
  loadFailed.value = false;
  try {
    const { data } = await EmailRoutesAPI.getRules();
    applyPayload(data);
  } catch {
    loadFailed.value = true;
  } finally {
    isLoading.value = false;
  }
};

const errorsFrom = error =>
  error?.response?.data?.errors || [t('FLIGHTSMOJO.EMAIL_ROUTING.ERROR')];

const save = async () => {
  isSaving.value = true;
  errors.value = [];
  try {
    const { data } = await EmailRoutesAPI.saveRules(toPayload(rules.value));
    applyPayload(data);
    useAlert(t('FLIGHTSMOJO.EMAIL_ROUTING.SAVED'));
  } catch (error) {
    errors.value = errorsFrom(error);
  } finally {
    isSaving.value = false;
  }
};

const discard = () => {
  rules.value = toPayload(savedRules.value);
  errors.value = [];
};

const addInbox = () => {
  const id = Number(inboxToAdd.value);
  if (!id || rules.value.some(rule => rule.inbox_id === id)) return;
  rules.value = [...rules.value, { inbox_id: id, senders: [], recipients: [] }];
  inboxToAdd.value = '';
};

const move = (index, delta) => {
  rules.value = moveRule(rules.value, index, delta);
};

const removeRule = index => {
  rules.value = rules.value.filter((_, position) => position !== index);
};

const check = async () => {
  isChecking.value = true;
  checkResult.value = null;
  try {
    const { data } = await EmailRoutesAPI.check({
      rules: toPayload(rules.value),
      from: checkFrom.value,
      to: checkTo.value,
    });
    checkResult.value = data;
  } catch (error) {
    checkResult.value = { result: 'error', errors: errorsFrom(error) };
  } finally {
    isChecking.value = false;
  }
};

const checkText = computed(() => {
  const data = checkResult.value;
  if (!data) return '';
  const inbox = data.inbox?.name || '';
  const key = {
    address: 'RESULT_ADDRESS',
    sender: 'RESULT_SENDER',
    recipient: 'RESULT_RECIPIENT',
    default: 'RESULT_DEFAULT',
    refused: 'RESULT_REFUSED',
    invalid: 'RESULT_INVALID',
  }[data.result];
  if (!key) return (data.errors || []).join(' ');
  return t(`FLIGHTSMOJO.EMAIL_ROUTING.CHECK.${key}`, {
    inbox,
    entry: data.entry || '',
  });
});

onMounted(load);
</script>

<template>
  <div class="flex flex-col gap-6 mt-4 text-[13px] text-n-slate-12">
    <p class="text-n-slate-11 leading-5">
      {{ t('FLIGHTSMOJO.EMAIL_ROUTING.INTRO') }}
    </p>

    <div v-if="isLoading" class="text-n-slate-11">
      {{ t('FLIGHTSMOJO.EMAIL_ROUTING.LOADING') }}
    </div>
    <div v-else-if="loadFailed" class="flex items-center gap-3 text-n-ruby-11">
      {{ t('FLIGHTSMOJO.EMAIL_ROUTING.LOAD_FAILED') }}
      <NextButton
        :label="t('FLIGHTSMOJO.EMAIL_ROUTING.RETRY')"
        size="sm"
        variant="faded"
        color="slate"
        @click="load"
      />
    </div>

    <template v-else>
      <ol class="reset-base flex flex-col gap-3">
        <li
          v-if="!rules.length"
          class="px-4 py-3 rounded-xl outline outline-1 -outline-offset-1 outline-n-weak text-n-slate-11"
        >
          {{ t('FLIGHTSMOJO.EMAIL_ROUTING.EMPTY') }}
        </li>
        <li
          v-for="(rule, index) in rules"
          :key="rule.inbox_id"
          class="flex flex-col gap-3 px-4 py-3 rounded-xl outline outline-1 -outline-offset-1 outline-n-weak bg-n-solid-1"
        >
          <div class="flex items-center gap-3">
            <span
              class="inline-flex items-center justify-center size-6 rounded-full bg-n-alpha-2 text-xs font-semibold text-n-slate-12"
            >
              {{ index + 1 }}
            </span>
            <div class="flex flex-col min-w-0 flex-1">
              <span class="font-medium truncate">
                {{
                  inboxById[rule.inbox_id]?.name ||
                  t('FLIGHTSMOJO.EMAIL_ROUTING.MISSING_INBOX', {
                    id: rule.inbox_id,
                  })
                }}
              </span>
              <span
                v-if="inboxById[rule.inbox_id]?.email"
                class="text-xs text-n-slate-11 truncate"
              >
                {{
                  t('FLIGHTSMOJO.EMAIL_ROUTING.OWN_ADDRESS', {
                    email: inboxById[rule.inbox_id].email,
                  })
                }}
              </span>
              <span
                v-if="inboxById[rule.inbox_id]?.members === 0"
                class="text-xs text-n-amber-11"
              >
                {{ t('FLIGHTSMOJO.EMAIL_ROUTING.NO_MEMBERS') }}
              </span>
            </div>
            <NextButton
              icon="i-lucide-arrow-up"
              size="xs"
              variant="ghost"
              color="slate"
              :disabled="index === 0 || isSaving"
              :aria-label="t('FLIGHTSMOJO.EMAIL_ROUTING.MOVE_UP')"
              @click="move(index, -1)"
            />
            <NextButton
              icon="i-lucide-arrow-down"
              size="xs"
              variant="ghost"
              color="slate"
              :disabled="index === rules.length - 1 || isSaving"
              :aria-label="t('FLIGHTSMOJO.EMAIL_ROUTING.MOVE_DOWN')"
              @click="move(index, 1)"
            />
            <NextButton
              icon="i-lucide-x"
              size="xs"
              variant="ghost"
              color="ruby"
              :disabled="isSaving"
              :aria-label="t('FLIGHTSMOJO.EMAIL_ROUTING.REMOVE_INBOX')"
              @click="removeRule(index)"
            />
          </div>
          <div class="grid gap-3 md:grid-cols-2">
            <FmAddressChips
              v-model="rule.senders"
              :label="t('FLIGHTSMOJO.EMAIL_ROUTING.SENDERS')"
              :placeholder="t('FLIGHTSMOJO.EMAIL_ROUTING.SENDERS_PLACEHOLDER')"
              :hint="t('FLIGHTSMOJO.EMAIL_ROUTING.SENDERS_HINT')"
              :disabled="isSaving"
            />
            <FmAddressChips
              v-model="rule.recipients"
              :label="t('FLIGHTSMOJO.EMAIL_ROUTING.RECIPIENTS')"
              :placeholder="
                t('FLIGHTSMOJO.EMAIL_ROUTING.RECIPIENTS_PLACEHOLDER')
              "
              :hint="t('FLIGHTSMOJO.EMAIL_ROUTING.RECIPIENTS_HINT')"
              :disabled="isSaving"
            />
          </div>
        </li>
      </ol>

      <div v-if="addOptions.length" class="flex items-center gap-2 max-w-xl">
        <ComboBox
          v-model="inboxToAdd"
          class="flex-1"
          :options="addOptions"
          :placeholder="t('FLIGHTSMOJO.EMAIL_ROUTING.ADD_PLACEHOLDER')"
        />
        <NextButton
          :label="t('FLIGHTSMOJO.EMAIL_ROUTING.ADD')"
          icon="i-lucide-plus"
          size="sm"
          variant="faded"
          color="slate"
          :disabled="!inboxToAdd || isSaving"
          @click="addInbox"
        />
      </div>

      <p class="text-n-slate-11">
        {{ t('FLIGHTSMOJO.EMAIL_ROUTING.EVERYTHING_ELSE') }}
      </p>

      <ul
        v-if="errors.length"
        class="reset-base flex flex-col gap-1 px-4 py-3 rounded-xl bg-n-ruby-2 text-n-ruby-11"
      >
        <li v-for="error in errors" :key="error">{{ error }}</li>
      </ul>

      <div class="flex flex-wrap items-center gap-3">
        <NextButton
          :label="t('FLIGHTSMOJO.EMAIL_ROUTING.SAVE')"
          size="sm"
          :is-loading="isSaving"
          :disabled="!isDirty || isSaving"
          @click="save"
        />
        <NextButton
          v-if="isDirty"
          :label="t('FLIGHTSMOJO.EMAIL_ROUTING.DISCARD')"
          size="sm"
          variant="faded"
          color="slate"
          :disabled="isSaving"
          @click="discard"
        />
        <span v-if="isDirty" class="text-n-amber-11">
          {{ t('FLIGHTSMOJO.EMAIL_ROUTING.UNSAVED') }}
        </span>
        <span v-else-if="changedText" class="text-n-slate-11">
          {{ changedText }}
        </span>
      </div>

      <section
        class="flex flex-col gap-3 px-4 py-4 rounded-xl outline outline-1 -outline-offset-1 outline-n-weak"
      >
        <div class="flex flex-col gap-1">
          <h3 class="text-sm font-medium">
            {{ t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.TITLE') }}
          </h3>
          <p class="text-n-slate-11">
            {{ t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.DESCRIPTION') }}
          </p>
        </div>
        <div class="grid gap-3 md:grid-cols-2">
          <Input
            v-model="checkFrom"
            :label="t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.FROM')"
            placeholder="nch-ca@gov.in"
          />
          <Input
            v-model="checkTo"
            :label="t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.TO')"
            placeholder="care@flightsmojo.in, legal@flightsmojo.in"
          />
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <NextButton
            :label="t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.BUTTON')"
            size="sm"
            variant="faded"
            color="slate"
            :is-loading="isChecking"
            :disabled="!checkTo.trim() || isChecking"
            @click="check"
          />
          <span
            v-if="checkText"
            class="font-medium"
            :class="
              ['refused', 'invalid', 'error'].includes(checkResult?.result)
                ? 'text-n-ruby-11'
                : 'text-n-teal-11'
            "
          >
            {{ checkText }}
          </span>
        </div>
        <p v-if="isDirty" class="text-xs text-n-slate-10">
          {{ t('FLIGHTSMOJO.EMAIL_ROUTING.CHECK.UNSAVED_NOTE') }}
        </p>
      </section>
    </template>
  </div>
</template>
