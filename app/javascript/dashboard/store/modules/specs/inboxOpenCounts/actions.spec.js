import { actions, FETCH_THROTTLE_MS } from '../../inboxOpenCounts';
import types from '../../../mutation-types';
import ConversationApi from '../../../../api/inbox/conversation';

vi.mock('../../../../api/inbox/conversation', () => ({
  default: { meta: vi.fn() },
}));

const commit = vi.fn();
const inboxes = [{ id: 1 }, { id: 2 }];
const rootGetters = { 'inboxes/getInboxes': inboxes };
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

  describe('#clear', () => {
    it('clears the counts', () => {
      actions.clear({ commit });

      expect(commit).toHaveBeenCalledWith(types.SET_INBOX_OPEN_COUNTS, {});
    });
  });
});
