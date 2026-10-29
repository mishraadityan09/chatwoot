import {
  STATUS_DOT_CLASS,
  STATUS_LABEL_KEY,
  statusDotClass,
  statusLabelKey,
} from '../status';

describe('status helpers', () => {
  it('gives every Chatwoot status a dot colour and a label key', () => {
    ['open', 'pending', 'snoozed', 'resolved'].forEach(status => {
      expect(statusDotClass(status)).toBe(STATUS_DOT_CLASS[status]);
      expect(statusLabelKey(status)).toBe(STATUS_LABEL_KEY[status]);
    });
  });

  it('falls back quietly for anything else', () => {
    expect(statusDotClass('archived')).toBe('bg-n-slate-7');
    expect(statusDotClass(undefined)).toBe('bg-n-slate-7');
    expect(statusLabelKey('archived')).toBeNull();
  });
});
