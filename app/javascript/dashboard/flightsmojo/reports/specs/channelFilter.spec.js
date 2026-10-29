import {
  ALL_CHANNELS,
  channelOptions,
  toInboxId,
  withChannelSuffix,
} from '../channelFilter';

describe('channelOptions', () => {
  it('puts All channels first and sorts inboxes by name', () => {
    const options = channelOptions(
      [
        { id: 7, name: 'USA.Chat' },
        { id: 3, name: 'India.Mail' },
        { id: 9, name: 'care@' },
      ],
      'All channels'
    );

    expect(options).toEqual([
      { value: ALL_CHANNELS, label: 'All channels' },
      { value: 9, label: 'care@' },
      { value: 3, label: 'India.Mail' },
      { value: 7, label: 'USA.Chat' },
    ]);
  });

  it('works with no inboxes', () => {
    expect(channelOptions([], 'All')).toEqual([
      { value: ALL_CHANNELS, label: 'All' },
    ]);
  });
});

describe('toInboxId', () => {
  it('maps All channels, a cleared combobox and nothing to null', () => {
    expect(toInboxId(ALL_CHANNELS)).toBeNull();
    expect(toInboxId('')).toBeNull();
    expect(toInboxId(undefined)).toBeNull();
    expect(toInboxId(null)).toBeNull();
  });

  it('returns a numeric inbox id', () => {
    expect(toInboxId(12)).toBe(12);
    expect(toInboxId('12')).toBe(12);
  });
});

describe('withChannelSuffix', () => {
  it('adds the channel as a slug before .csv', () => {
    expect(
      withChannelSuffix('agent-report-19-10-2026.csv', 'USA-CA.Email')
    ).toBe('agent-report-19-10-2026-usa-ca-email.csv');
    expect(
      withChannelSuffix('agent-report-19-10-2026-business-hours.csv', 'care@')
    ).toBe('agent-report-19-10-2026-business-hours-care.csv');
  });

  it('leaves the name alone without a channel or a usable slug', () => {
    expect(withChannelSuffix('agent-report.csv', null)).toBe(
      'agent-report.csv'
    );
    expect(withChannelSuffix('agent-report.csv', '')).toBe('agent-report.csv');
    expect(withChannelSuffix('agent-report.csv', '@@@')).toBe(
      'agent-report.csv'
    );
  });
});
