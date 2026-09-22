import { getters } from '../../inboxOpenCounts';

describe('#getters', () => {
  it('returns the open count for an inbox, or 0 when unknown', () => {
    const state = { counts: { 1: 4 } };

    expect(getters.getInboxOpenCount(state)(1)).toEqual(4);
    expect(getters.getInboxOpenCount(state)('1')).toEqual(4);
    expect(getters.getInboxOpenCount(state)(2)).toEqual(0);
  });
});
