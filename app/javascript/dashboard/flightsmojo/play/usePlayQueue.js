// FlightsMojo: Zendesk-style Play mode. "Play" in the ticket table header
// opens the first ticket of the current view; "Next ticket" on an open ticket
// opens the first ticket of the view — in its *live* order — that has not been
// played in this session. Using the live list means resolved or reassigned
// tickets that have left the view are skipped, and a new urgent ticket comes
// up next (the default sort is priority, oldest first). Stop or Back ends it.
//
// Module-level state: one Play session per browser tab; account switch and
// logout are full page loads.
import { computed, reactive, toValue } from 'vue';
import { useRouter } from 'vue-router';
import { useConversationRoutePath } from 'dashboard/composables/useConversationRoutePath';

const session = reactive({
  active: false,
  played: new Set(),
  listPath: '',
});

// Ids of the view's rows in display order; registered by the ticket table.
let liveIds = () => [];
export const setPlayLiveList = list => {
  liveIds = () => (toValue(list) || []).map(chat => chat.id);
};

export const isPlaying = computed(() => session.active);

/** First ticket in the live view that is neither played nor current. */
export const nextPlayableId = (currentId, ids = liveIds()) =>
  ids.find(id => id !== currentId && !session.played.has(id)) ?? null;

export const remainingCount = currentId =>
  liveIds().filter(id => id !== currentId && !session.played.has(id)).length;

/** Ends Play mode without navigating (e.g. the agent went Back). */
export const endPlay = () => {
  session.active = false;
  session.played = new Set();
  session.listPath = '';
};

export const usePlayQueue = () => {
  const router = useRouter();
  const { buildConversationPath, buildConversationListPath } =
    useConversationRoutePath();

  const open = id => {
    session.played.add(id);
    router.push(buildConversationPath(id));
  };

  const play = () => {
    const [first] = liveIds();
    if (first === undefined) return;
    session.active = true;
    session.played = new Set();
    session.listPath = buildConversationListPath();
    open(first);
  };

  const stop = () => {
    const path = session.listPath;
    endPlay();
    if (path) router.push(path);
  };

  const next = currentId => {
    if (currentId !== undefined && currentId !== null) {
      session.played.add(currentId);
    }
    const id = nextPlayableId(currentId);
    if (id === null) {
      stop();
      return;
    }
    open(id);
  };

  return { isPlaying, play, next, stop, remainingCount };
};

// Test hook.
export const resetPlay = () => {
  endPlay();
  liveIds = () => [];
};
