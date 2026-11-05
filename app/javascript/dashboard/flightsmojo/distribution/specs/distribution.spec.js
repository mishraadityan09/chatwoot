import {
  agentMatches,
  buildPreviewPayload,
  inboxNames,
  isFinished,
  previewRows,
  processedCount,
} from '../distribution';

describe('FM-39 distribution helpers', () => {
  it('knows when a run has finished', () => {
    expect(isFinished({ state: 'done' })).toBe(true);
    expect(isFinished({ state: 'failed' })).toBe(true);
    expect(isFinished({ state: 'running' })).toBe(false);
    expect(isFinished(null)).toBe(false);
  });

  it('counts processed tickets', () => {
    expect(processedCount({ moved: 3, skipped: 2 })).toBe(5);
    expect(processedCount({})).toBe(0);
  });

  it('matches agents by name, ignoring case and spaces', () => {
    expect(agentMatches({ name: 'Anmol' }, ' anm ')).toBe(true);
    expect(agentMatches({ name: 'Anmol' }, 'zed')).toBe(false);
    expect(agentMatches({ name: 'Anmol' }, '')).toBe(true);
  });

  it('builds the preview request', () => {
    expect(
      buildPreviewPayload({
        agentIds: [1, 2],
        inboxIds: [7],
        teamId: '',
        includeSnoozed: 1,
      })
    ).toEqual({
      agent_ids: [1, 2],
      inbox_ids: [7],
      team_id: null,
      include_snoozed: true,
    });
  });

  it('names inboxes and skips unknown ids', () => {
    const inboxes = [
      { id: 1, name: 'India.Mail' },
      { id: 2, name: 'UK.Email' },
    ];
    expect(inboxNames([2, 9, 1], inboxes)).toEqual(['UK.Email', 'India.Mail']);
  });

  it('puts picked agents first, then agents losing tickets, then unassigned', () => {
    const rows = previewRows({
      agents: [{ id: 1, name: 'Anmol', before: 0, after: 3, incoming: 3 }],
      others: [
        { id: null, name: null, before: 2, after: 0, outgoing: 2 },
        { id: 9, name: 'Zed', before: 4, after: 0, outgoing: 4 },
        { id: 8, name: 'Nobody', before: 0, after: 0, outgoing: 0 },
      ],
    });
    expect(rows.map(row => [row.id, row.picked])).toEqual([
      [1, true],
      [9, false],
      [null, false],
    ]);
  });
});
