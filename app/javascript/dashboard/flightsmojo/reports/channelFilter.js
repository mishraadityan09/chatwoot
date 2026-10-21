// FlightsMojo: channel (inbox) filter for the agents summary report
// (Reports → Agents). Pure helpers; the component is FmChannelFilter.vue.

export const ALL_CHANNELS = 'all';

// Combobox options: "All channels" first, then every inbox by name.
export const channelOptions = (inboxes, allLabel) => [
  { value: ALL_CHANNELS, label: allLabel },
  ...[...inboxes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(inbox => ({ value: inbox.id, label: inbox.name })),
];

// The combobox emits '' when the selected option is clicked again; both that
// and the explicit "All channels" option mean no filter.
export const toInboxId = value => {
  if (value === ALL_CHANNELS || value === '' || value == null) return null;
  return Number(value);
};

// agent-report-19-10-2026.csv → agent-report-19-10-2026-usa-ca-email.csv
export const withChannelSuffix = (fileName, inboxName) => {
  if (!inboxName) return fileName;
  const slug = inboxName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return fileName;
  return fileName.replace(/\.csv$/, `-${slug}.csv`);
};
