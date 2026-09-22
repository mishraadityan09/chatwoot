import { actions, FETCH_THROTTLE_MS } from '../../inboxOpenCounts';
import types from '../../../mutation-types';
import ConversationApi from '../../../../api/inbox/conversation';

vi.mock('../../../../api/inbox/conversation', () => ({
  default: { meta: vi.fn() },
}));

const commit = vi.fn();
const inboxes = [{ id: 1 }, { id: 2 }];
const rootGetters = { 'inboxes/getInboxes': inboxes };
const oneInbox = { 'inboxes/getInboxes': [{ id: 1 }] };
const metaResponse = count => ({ data: { meta: { all_count: count } } });

describe('#actions', () => {
  beforeEach(() => {
    commit.mockClear();
    ConversationApi.meta.mockReset();
  });

  describe('#fetchNow', () => {
    it('requests the open count of every inbox and commits them', async () => {
      ConversationApi.meta
        .mockResolvedValueOnce(metaResponse(3))
        .mockResolvedValueOnce(metaResponse('7'));

      await actions.fetchNow({ commit, state: { counts: {} }, rootGetters });

      expect(ConversationApi.meta).toHaveBeenCalledWith({
        inboxId: 1,
        status: 'open',
      });
      expect(ConversationApi.meta).toHaveBeenCalledWith({
        inboxId: 2,
        status: 'open',
      });
      expect(commit).toHaveBeenCalledWith(types.SET_INBOX_OPEN_COUNTS, {
        1: 3,
        2: 7,
      });
    });

    it('keeps the last known count for an inbox whose request fails', async () => {
      ConversationApi.meta
        .mockRejectedValueOnce(new Error('Request failed'))
        .mockResolvedValueOnce(metaResponse(2));

      await actions.fetchNow({
        commit,
        state: { counts: { 1: 40, 2: 5 } },
        rootGetters,
      });

      expect(commit).toHaveBeenCalledWith(types.SET_INBOX_OPEN_COUNTS, {
        1: 40,
        2: 2,
      });
    });

    it('does nothing until the inbox list is loaded', async () => {
      await actions.fetchNow({
        commit,
        state: { counts: {} },
        rootGetters: { 'inboxes/getInboxes': [] },
      });

      expect(ConversationApi.meta).not.toHaveBeenCalled();
      expect(commit).not.toHaveBeenCalled();
    });

    it('ignores a slow round that finishes after a newer round committed', async () => {
      let finishSlowRound;
      ConversationApi.meta
        .mockReturnValueOnce(
          new Promise(resolve => {
            finishSlowRound = resolve;
          })
        )
        .mockResolvedValueOnce(metaResponse(5));
      const state = { counts: {} };

      const slowRound = actions.fetchNow({
        commit,
        state,
        rootGetters: oneInbox,
      });
      await actions.fetchNow({ commit, state, rootGetters: oneInbox });
      finishSlowRound(metaResponse(1));
      await slowRound;

      expect(commit.mock.calls).toEqual([
        [types.SET_INBOX_OPEN_COUNTS, { 1: 5 }],
      ]);
    });

    it('still commits a slow round when no newer round has committed yet', async () => {
      let finishFirst;
      let finishSecond;
      ConversationApi.meta
        .mockReturnValueOnce(
          new Promise(resolve => {
            finishFirst = resolve;
          })
        )
        .mockReturnValueOnce(
          new Promise(resolve => {
            finishSecond = resolve;
          })
        );
      const state = { counts: {} };

      const first = actions.fetchNow({ commit, state, rootGetters: oneInbox });
      const second = actions.fetchNow({ commit, state, rootGetters: oneInbox });
      finishFirst(metaResponse(1));
      await first;
      finishSecond(metaResponse(2));
      await second;

      expect(commit.mock.calls).toEqual([
        [types.SET_INBOX_OPEN_COUNTS, { 1: 1 }],
        [types.SET_INBOX_OPEN_COUNTS, { 1: 2 }],
      ]);
    });
  });

  describe('#fetch', () => {
    const state = { counts: {} };
    const dispatch = vi.fn(name => {
      if (name === 'fetchNow') actions.fetchNow({ commit, state, rootGetters });
    });

    beforeEach(() => {
      vi.useFakeTimers();
      // Well past any throttle window left behind by the tests above.
      vi.setSystemTime(Date.now() + 10 * FETCH_THROTTLE_MS);
      dispatch.mockClear();
      ConversationApi.meta.mockResolvedValue(metaResponse(1));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('collapses a burst into one immediate and one trailing fetch', () => {
      actions.fetch({ dispatch });
      actions.fetch({ dispatch });
      actions.fetch({ dispatch });
      expect(dispatch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(FETCH_THROTTLE_MS);
      expect(dispatch).toHaveBeenCalledTimes(2);
    });
  });
});
