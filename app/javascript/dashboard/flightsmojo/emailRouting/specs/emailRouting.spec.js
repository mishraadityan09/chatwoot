import {
  addEntries,
  availableInboxes,
  isValidEntry,
  moveRule,
  sameRules,
  splitEntries,
  toPayload,
} from '../emailRouting';

describe('emailRouting helpers (FM-41)', () => {
  it('accepts addresses and @domains, nothing else', () => {
    expect(isValidEntry(' NCH-CA@gov.in ')).toBe(true);
    expect(isValidEntry('@gov.in')).toBe(true);
    expect(isValidEntry('@nic.in')).toBe(true);
    expect(isValidEntry('gov.in')).toBe(false);
    expect(isValidEntry('@localhost')).toBe(false);
    expect(isValidEntry('not an address')).toBe(false);
    expect(isValidEntry('Name <a@b.com>')).toBe(false);
  });

  it('splits pasted lists on spaces, commas and semicolons', () => {
    expect(splitEntries('A@x.com, @y.com;b@z.in\n c@d.com')).toEqual([
      'a@x.com',
      '@y.com',
      'b@z.in',
      'c@d.com',
    ]);
  });

  it('adds valid entries once and hands back the invalid ones', () => {
    expect(addEntries(['a@x.com'], 'A@x.com @gov.in oops')).toEqual({
      list: ['a@x.com', '@gov.in'],
      invalid: ['oops'],
    });
  });

  it('moves a rule up or down and ignores moves past either end', () => {
    const rules = [{ inbox_id: 1 }, { inbox_id: 2 }, { inbox_id: 3 }];
    expect(moveRule(rules, 2, -1).map(rule => rule.inbox_id)).toEqual([
      1, 3, 2,
    ]);
    expect(moveRule(rules, 0, 1).map(rule => rule.inbox_id)).toEqual([2, 1, 3]);
    expect(moveRule(rules, 0, -1)).toBe(rules);
    expect(moveRule(rules, 2, 1)).toBe(rules);
  });

  it('offers only inboxes that are not listed yet', () => {
    const inboxes = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(availableInboxes(inboxes, [{ inbox_id: 2 }])).toEqual([
      { id: 1 },
      { id: 3 },
    ]);
  });

  it('builds the payload and compares rule lists by content and order', () => {
    const rules = [{ inbox_id: 1, senders: ['a@x.com'], name: 'Legal' }];
    expect(toPayload(rules)).toEqual([
      { inbox_id: 1, senders: ['a@x.com'], recipients: [] },
    ]);
    expect(sameRules(rules, [{ inbox_id: 1, senders: ['a@x.com'] }])).toBe(
      true
    );
    expect(sameRules(rules, [{ inbox_id: 1, senders: [] }])).toBe(false);
  });
});
