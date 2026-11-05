<script setup>
// FlightsMojo (FM-39): administrators share unsolved tickets equally among the
// agents THEY pick (online status is shown, but does not decide). Steps:
// pick tickets + agents → preview (nothing changes) → confirm → progress → done.
// Fewest moves: a picked agent keeps their own tickets up to their share; the
// server decides who gets what and re-checks every ticket when it moves it.
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import Dialog from 'dashboard/components-next/dialog/Dialog.vue';
import NextButton from 'dashboard/components-next/button/Button.vue';
import Checkbox from 'dashboard/components-next/checkbox/Checkbox.vue';
import TicketDistributionAPI from 'dashboard/api/ticketDistribution';
import { emitter } from 'shared/helpers/mitt';
import {
  agentMatches,
  buildPreviewPayload,
  inboxNames,
  isFinished,
  previewRows,
  processedCount,
} from './distribution';

const props = defineProps({
  // ChatListHeader mounts this on the first click; open straight away then.
  openOnMount: { type: Boolean, default: false },
});

const POLL_MS = 1500;
const STATUS_DOT = {
  online: 'bg-n-teal-10',
  busy: 'bg-n-amber-10',
  offline: 'bg-n-slate-8',
};

const { t } = useI18n();
const dialog = useTemplateRef('dialog');

const step = ref('pick'); // pick | preview | running | done
const loading = ref(false);
const error = ref('');
const options = ref({ agents: [], inboxes: [], teams: [] });
const selectedInboxIds = ref([]);
const selectedAgentIds = ref([]);
const teamId = ref('');
const includeSnoozed = ref(false);
const agentQuery = ref('');
const preview = ref(null);
const turnOffAutoAssignment = ref(true);
const status = ref(null);
const applyResult = ref(null);
let pollTimer = null;

const stopPolling = () => {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
};
onBeforeUnmount(stopPolling);

const errorMessage = e =>
  e?.response?.data?.error || t('FLIGHTSMOJO.DISTRIBUTE.ERRORS.GENERIC');

// ── Step 1: tickets and agents ──
const allInboxesSelected = computed(
  () =>
    options.value.inboxes.length > 0 &&
    selectedInboxIds.value.length === options.value.inboxes.length
);
const someInboxesSelected = computed(
  () => selectedInboxIds.value.length > 0 && !allInboxesSelected.value
);
const toggleAllInboxes = checked => {
  selectedInboxIds.value = checked
    ? options.value.inboxes.map(inbox => inbox.id)
    : [];
};
const toggleId = (list, id, checked) =>
  checked ? [...new Set([...list, id])] : list.filter(item => item !== id);
const toggleInbox = (id, checked) => {
  selectedInboxIds.value = toggleId(selectedInboxIds.value, id, checked);
};
const toggleAgent = (id, checked) => {
  selectedAgentIds.value = toggleId(selectedAgentIds.value, id, checked);
};
const visibleAgents = computed(() =>
  options.value.agents.filter(agent => agentMatches(agent, agentQuery.value))
);
const selectVisibleAgents = () => {
  selectedAgentIds.value = [
    ...new Set([
      ...selectedAgentIds.value,
      ...visibleAgents.value.map(agent => agent.id),
    ]),
  ];
};
const clearAgents = () => {
  selectedAgentIds.value = [];
};
const canPreview = computed(
  () =>
    !loading.value &&
    selectedAgentIds.value.length > 0 &&
    selectedInboxIds.value.length > 0
);

const loadOptions = async () => {
  loading.value = true;
  try {
    const { data } = await TicketDistributionAPI.getOptions();
    options.value = data;
    selectedInboxIds.value = data.inboxes
      .filter(inbox => inbox.open_count > 0)
      .map(inbox => inbox.id);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
};

// ── Step 2: preview ──
const rows = computed(() => previewRows(preview.value));
const autoAssignmentInboxNames = computed(() =>
  inboxNames(preview.value?.auto_assignment_inbox_ids, options.value.inboxes)
);
const rowName = row =>
  row.id === null ? t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.UNASSIGNED') : row.name;
const change = row => {
  const delta = (row.incoming || 0) - (row.outgoing || 0);
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `${delta}`;
  return '0';
};

const runPreview = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await TicketDistributionAPI.preview(
      buildPreviewPayload({
        agentIds: selectedAgentIds.value,
        inboxIds: selectedInboxIds.value,
        teamId: teamId.value,
        includeSnoozed: includeSnoozed.value,
      })
    );
    preview.value = data;
    turnOffAutoAssignment.value = data.auto_assignment_inbox_ids.length > 0;
    step.value = 'preview';
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
};

// ── Step 3: confirm, progress, done ──
const progress = computed(() => {
  const total = status.value?.total || 0;
  if (!total) return 100;
  return Math.min(
    100,
    Math.round((processedCount(status.value) / total) * 100)
  );
});

const poll = () => {
  stopPolling();
  pollTimer = setTimeout(async () => {
    try {
      const { data } = await TicketDistributionAPI.status(preview.value.token);
      status.value = data;
    } catch {
      // a missed poll is retried on the next tick
    }
    if (isFinished(status.value)) {
      step.value = 'done';
      emitter.emit('fetch_conversation_stats');
    } else if (step.value === 'running') {
      poll();
    }
  }, POLL_MS);
};

const runApply = async () => {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await TicketDistributionAPI.apply({
      token: preview.value.token,
      turn_off_auto_assignment:
        turnOffAutoAssignment.value &&
        preview.value.auto_assignment_inbox_ids.length > 0,
    });
    applyResult.value = data;
    status.value = { state: 'queued', total: data.total, moved: 0, skipped: 0 };
    step.value = 'running';
    poll();
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
};

const backToPick = () => {
  error.value = '';
  step.value = 'pick';
};

const close = () => dialog.value?.close();
const onClose = () => stopPolling();

const open = () => {
  step.value = 'pick';
  error.value = '';
  preview.value = null;
  status.value = null;
  applyResult.value = null;
  agentQuery.value = '';
  selectedAgentIds.value = [];
  teamId.value = '';
  includeSnoozed.value = false;
  stopPolling();
  dialog.value?.open();
  loadOptions();
};

onMounted(() => {
  if (props.openOnMount) open();
});

defineExpose({ open });
</script>

<template>
  <Dialog
    ref="dialog"
    :title="t('FLIGHTSMOJO.DISTRIBUTE.TITLE')"
    :description="t('FLIGHTSMOJO.DISTRIBUTE.DESCRIPTION')"
    width="3xl"
    overflow-y-auto
    @close="onClose"
  >
    <!-- Step 1: which tickets, which agents -->
    <div v-if="step === 'pick'" class="flex flex-col gap-5 text-sm">
      <p v-if="loading && !options.agents.length" class="text-n-slate-11">
        {{ t('FLIGHTSMOJO.DISTRIBUTE.LOADING') }}
      </p>

      <section class="flex flex-col gap-2">
        <h4 class="font-medium text-n-slate-12">
          {{ t('FLIGHTSMOJO.DISTRIBUTE.TICKETS.HEADING') }}
        </h4>
        <label class="flex items-center gap-2 text-n-slate-12 cursor-pointer">
          <Checkbox
            :model-value="allInboxesSelected"
            :indeterminate="someInboxesSelected"
            @update:model-value="toggleAllInboxes"
          />
          {{ t('FLIGHTSMOJO.DISTRIBUTE.TICKETS.ALL_INBOXES') }}
        </label>
        <div
          class="grid grid-cols-2 gap-x-6 gap-y-1.5 max-h-40 overflow-y-auto ps-6"
        >
          <label
            v-for="inbox in options.inboxes"
            :key="inbox.id"
            class="flex items-center gap-2 min-w-0 cursor-pointer"
          >
            <Checkbox
              :model-value="selectedInboxIds.includes(inbox.id)"
              @update:model-value="value => toggleInbox(inbox.id, value)"
            />
            <span class="truncate text-n-slate-12">{{ inbox.name }}</span>
            <span class="shrink-0 text-n-slate-11 tabular-nums">
              {{ inbox.open_count }}
            </span>
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-4 pt-1">
          <select
            v-model="teamId"
            class="!mb-0 !h-8 !py-0 !w-auto min-w-48 text-sm"
            :aria-label="t('FLIGHTSMOJO.DISTRIBUTE.TICKETS.TEAM')"
          >
            <option value="">
              {{ t('FLIGHTSMOJO.DISTRIBUTE.TICKETS.ANY_TEAM') }}
            </option>
            <option
              v-for="team in options.teams"
              :key="team.id"
              :value="team.id"
            >
              {{ team.name }}
            </option>
          </select>
          <label class="flex items-center gap-2 text-n-slate-12 cursor-pointer">
            <Checkbox v-model="includeSnoozed" />
            {{ t('FLIGHTSMOJO.DISTRIBUTE.TICKETS.INCLUDE_SNOOZED') }}
          </label>
        </div>
      </section>

      <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <h4 class="font-medium text-n-slate-12">
            {{
              t(
                'FLIGHTSMOJO.DISTRIBUTE.AGENTS.HEADING',
                { n: selectedAgentIds.length },
                selectedAgentIds.length
              )
            }}
          </h4>
          <div class="flex items-center gap-1">
            <NextButton
              type="button"
              :label="t('FLIGHTSMOJO.DISTRIBUTE.AGENTS.SELECT_SHOWN')"
              slate
              xs
              ghost
              @click="selectVisibleAgents"
            />
            <NextButton
              type="button"
              :label="t('FLIGHTSMOJO.DISTRIBUTE.AGENTS.CLEAR')"
              slate
              xs
              ghost
              @click="clearAgents"
            />
          </div>
        </div>
        <p class="text-xs text-n-slate-11">
          {{ t('FLIGHTSMOJO.DISTRIBUTE.AGENTS.HINT') }}
        </p>
        <input
          v-model="agentQuery"
          type="search"
          class="!mb-0 !h-8 text-sm"
          :placeholder="t('FLIGHTSMOJO.DISTRIBUTE.AGENTS.SEARCH')"
        />
        <div
          class="grid grid-cols-2 gap-x-6 gap-y-1.5 max-h-56 overflow-y-auto"
        >
          <label
            v-for="agent in visibleAgents"
            :key="agent.id"
            class="flex items-center gap-2 min-w-0 cursor-pointer"
          >
            <Checkbox
              :model-value="selectedAgentIds.includes(agent.id)"
              @update:model-value="value => toggleAgent(agent.id, value)"
            />
            <span
              class="shrink-0 size-2 rounded-full"
              :class="
                STATUS_DOT[agent.availability_status] || STATUS_DOT.offline
              "
              :title="agent.availability_status"
            />
            <span class="truncate text-n-slate-12">{{ agent.name }}</span>
            <span
              v-if="agent.role === 'administrator'"
              class="shrink-0 px-1.5 rounded bg-n-slate-3 text-xs text-n-slate-11"
            >
              {{ t('FLIGHTSMOJO.DISTRIBUTE.AGENTS.ADMIN') }}
            </span>
            <span class="ms-auto shrink-0 text-n-slate-11 tabular-nums">
              {{
                t(
                  'FLIGHTSMOJO.DISTRIBUTE.AGENTS.OPEN',
                  { n: agent.open_count },
                  agent.open_count
                )
              }}
            </span>
          </label>
        </div>
      </section>
    </div>

    <!-- Step 2: preview, nothing has changed yet -->
    <div v-else-if="step === 'preview'" class="flex flex-col gap-4 text-sm">
      <p class="text-n-slate-12">
        {{
          t(
            'FLIGHTSMOJO.DISTRIBUTE.PREVIEW.SUMMARY',
            {
              n: preview.ticket_count,
              moving: preview.moving,
              unassigned: preview.unassigned_before,
            },
            preview.ticket_count
          )
        }}
      </p>
      <div class="max-h-72 overflow-y-auto rounded-lg border border-n-weak">
        <table class="w-full text-start">
          <thead
            class="sticky top-0 bg-n-alpha-3 backdrop-blur text-n-slate-11"
          >
            <tr>
              <th class="px-3 py-2 font-medium text-start">
                {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.AGENT') }}
              </th>
              <th class="px-3 py-2 font-medium text-end">
                {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.NOW') }}
              </th>
              <th class="px-3 py-2 font-medium text-end">
                {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.AFTER') }}
              </th>
              <th class="px-3 py-2 font-medium text-end">
                {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.CHANGE') }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="`${row.picked}-${row.id}`"
              class="border-t border-n-weak"
              :class="{ 'text-n-slate-11': !row.picked }"
            >
              <td class="px-3 py-1.5">
                {{ rowName(row) }}
                <span v-if="!row.picked && row.id !== null" class="text-xs">
                  {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.NOT_PICKED') }}
                </span>
                <span
                  v-else-if="row.picked && row.can_take === 0"
                  class="text-xs text-n-amber-11"
                >
                  {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.CANNOT_TAKE') }}
                </span>
              </td>
              <td class="px-3 py-1.5 text-end tabular-nums">
                {{ row.before }}
              </td>
              <td class="px-3 py-1.5 text-end tabular-nums font-medium">
                {{ row.after }}
              </td>
              <td class="px-3 py-1.5 text-end tabular-nums">
                {{ change(row) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="preview.unplaceable.length"
        class="flex flex-col gap-1 p-3 rounded-lg bg-n-amber-2 text-n-amber-11"
      >
        <p v-for="row in preview.unplaceable" :key="row.inbox_id">
          {{
            t(
              'FLIGHTSMOJO.DISTRIBUTE.PREVIEW.UNPLACEABLE',
              { n: row.count, inbox: row.inbox_name },
              row.count
            )
          }}
        </p>
      </div>

      <label
        v-if="preview.auto_assignment_inbox_ids.length"
        class="flex items-start gap-2 text-n-slate-12 cursor-pointer"
      >
        <Checkbox v-model="turnOffAutoAssignment" class="mt-0.5 shrink-0" />
        <span>
          {{
            t(
              'FLIGHTSMOJO.DISTRIBUTE.PREVIEW.AUTO_ASSIGN_OFF',
              {
                n: preview.auto_assignment_inbox_ids.length,
                inboxes: autoAssignmentInboxNames.join(', '),
              },
              preview.auto_assignment_inbox_ids.length
            )
          }}
        </span>
      </label>
      <p class="text-xs text-n-slate-11">
        {{ t('FLIGHTSMOJO.DISTRIBUTE.PREVIEW.NOTIFY_NOTE') }}
      </p>
    </div>

    <!-- Step 3: progress and result -->
    <div v-else class="flex flex-col gap-3 text-sm">
      <p class="text-n-slate-12">
        <template v-if="step === 'running'">
          {{
            t('FLIGHTSMOJO.DISTRIBUTE.RUNNING', {
              done: processedCount(status),
              total: status?.total || 0,
            })
          }}
        </template>
        <template v-else-if="status?.state === 'failed'">
          {{
            t('FLIGHTSMOJO.DISTRIBUTE.FAILED', { error: status.error || '' })
          }}
        </template>
        <template v-else>
          {{
            t('FLIGHTSMOJO.DISTRIBUTE.DONE', {
              moved: status?.moved || 0,
              skipped: status?.skipped || 0,
            })
          }}
        </template>
      </p>
      <div class="h-2 rounded-full bg-n-slate-3 overflow-hidden">
        <div
          class="h-2 rounded-full bg-n-brand transition-all"
          :style="{ width: `${progress}%` }"
        />
      </div>
      <p
        v-if="applyResult?.auto_assignment_turned_off?.length"
        class="text-n-slate-11"
      >
        {{
          t(
            'FLIGHTSMOJO.DISTRIBUTE.AUTO_ASSIGN_TURNED_OFF',
            { n: applyResult.auto_assignment_turned_off.length },
            applyResult.auto_assignment_turned_off.length
          )
        }}
      </p>
      <p v-if="step === 'running'" class="text-xs text-n-slate-11">
        {{ t('FLIGHTSMOJO.DISTRIBUTE.RUNNING_NOTE') }}
      </p>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2 w-full">
        <p v-if="error" class="text-sm text-n-ruby-11">{{ error }}</p>
        <div class="flex items-center justify-end gap-2 w-full">
          <template v-if="step === 'pick'">
            <NextButton
              type="button"
              :label="t('FLIGHTSMOJO.DISTRIBUTE.ACTIONS.CANCEL')"
              slate
              faded
              @click="close"
            />
            <NextButton
              type="button"
              :label="t('FLIGHTSMOJO.DISTRIBUTE.ACTIONS.PREVIEW')"
              :disabled="!canPreview"
              :is-loading="loading"
              @click="runPreview"
            />
          </template>
          <template v-else-if="step === 'preview'">
            <NextButton
              type="button"
              :label="t('FLIGHTSMOJO.DISTRIBUTE.ACTIONS.BACK')"
              slate
              faded
              @click="backToPick"
            />
            <NextButton
              type="button"
              :label="
                t(
                  'FLIGHTSMOJO.DISTRIBUTE.ACTIONS.CONFIRM',
                  { n: preview.moving },
                  preview.moving
                )
              "
              :disabled="!preview.moving || loading"
              :is-loading="loading"
              @click="runApply"
            />
          </template>
          <NextButton
            v-else
            type="button"
            :label="t('FLIGHTSMOJO.DISTRIBUTE.ACTIONS.CLOSE')"
            slate
            faded
            @click="close"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
