// FlightsMojo (FM-39): small pure helpers for the Distribute window.

export const FINISHED_STATES = ['done', 'failed'];

export const isFinished = status =>
  FINISHED_STATES.includes(status?.state || '');

export const processedCount = status =>
  (status?.moved || 0) + (status?.skipped || 0);

export const agentMatches = (agent, query) => {
  const needle = (query || '').trim().toLowerCase();
  if (!needle) return true;
  return (agent?.name || '').toLowerCase().includes(needle);
};

export const buildPreviewPayload = ({
  agentIds = [],
  inboxIds = [],
  teamId = null,
  includeSnoozed = false,
}) => ({
  agent_ids: [...agentIds],
  inbox_ids: [...inboxIds],
  team_id: teamId || null,
  include_snoozed: !!includeSnoozed,
});

export const inboxNames = (ids = [], inboxes = []) => {
  const byId = new Map(inboxes.map(inbox => [inbox.id, inbox.name]));
  return ids.map(id => byId.get(id)).filter(Boolean);
};

// Rows for the preview table: picked agents first (in the server's order),
// then everyone who loses tickets, "unassigned" (id null) last.
export const previewRows = preview => {
  const picked = (preview?.agents || []).map(row => ({ ...row, picked: true }));
  const others = (preview?.others || [])
    .filter(row => row.before > 0)
    .map(row => ({ ...row, picked: false, incoming: 0 }));
  const sortedOthers = [
    ...others.filter(row => row.id !== null),
    ...others.filter(row => row.id === null),
  ];
  return [...picked, ...sortedOthers];
};
