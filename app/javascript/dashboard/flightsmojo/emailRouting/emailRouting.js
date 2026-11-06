// FlightsMojo (FM-41): pure helpers for Settings → Email Routing. The server
// (app/services/email_routes.rb) checks everything again before saving.

const ADDRESS = /^[^\s@,;<>]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const DOMAIN = /^@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export const normalizeEntry = value =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// An email address, or "@domain" for that domain and its subdomains.
export const isValidEntry = value => {
  const entry = normalizeEntry(value);
  return ADDRESS.test(entry) || DOMAIN.test(entry);
};

// "a@x.com, @y.com; b@z.in" → ['a@x.com', '@y.com', 'b@z.in']
export const splitEntries = text =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .map(normalizeEntry)
    .filter(Boolean);

// Adds typed or pasted entries to a list: valid ones once each, invalid ones handed back.
export const addEntries = (list, text) => {
  const valid = [];
  const invalid = [];
  splitEntries(text).forEach(entry =>
    (isValidEntry(entry) ? valid : invalid).push(entry)
  );
  return { list: [...new Set([...list, ...valid])], invalid };
};

// Swaps a rule with its neighbour; out-of-range moves leave the list as it is.
export const moveRule = (rules, index, delta) => {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rules.length) return rules;
  const next = [...rules];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};

export const availableInboxes = (inboxes, rules) => {
  const used = new Set(rules.map(rule => rule.inbox_id));
  return inboxes.filter(inbox => !used.has(inbox.id));
};

export const toPayload = rules =>
  rules.map(rule => ({
    inbox_id: rule.inbox_id,
    senders: [...(rule.senders || [])],
    recipients: [...(rule.recipients || [])],
  }));

export const sameRules = (a, b) =>
  JSON.stringify(toPayload(a)) === JSON.stringify(toPayload(b));
