import { mutations } from '../../inboxOpenCounts';
import types from '../../../mutation-types';

describe('#mutations', () => {
  it('replaces the counts', () => {
    const state = { counts: { 1: 4 } };

    mutations[types.SET_INBOX_OPEN_COUNTS](state, { 2: 9 });

    expect(state.counts).toEqual({ 2: 9 });
  });
});
