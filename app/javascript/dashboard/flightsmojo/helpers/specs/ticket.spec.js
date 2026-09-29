import { getTicketSubject } from '../ticket';

describe('getTicketSubject', () => {
  it('reads the email subject', () => {
    expect(
      getTicketSubject({
        additional_attributes: { mail_subject: 'Refund not received' },
      })
    ).toBe('Refund not received');
  });

  it('reads the subject of an API (website) ticket', () => {
    expect(
      getTicketSubject({ additional_attributes: { subject: 'Name change' } })
    ).toBe('Name change');
  });

  it('prefers the email subject when both are present', () => {
    expect(
      getTicketSubject({
        additional_attributes: { mail_subject: 'Email', subject: 'API' },
      })
    ).toBe('Email');
  });

  it('trims surrounding whitespace', () => {
    expect(
      getTicketSubject({ additional_attributes: { subject: '  Baggage  ' } })
    ).toBe('Baggage');
  });

  it('returns an empty string when there is no subject', () => {
    expect(getTicketSubject({ additional_attributes: {} })).toBe('');
    expect(getTicketSubject({})).toBe('');
    expect(getTicketSubject(undefined)).toBe('');
  });

  it('ignores non-string values', () => {
    expect(
      getTicketSubject({ additional_attributes: { subject: { x: 1 } } })
    ).toBe('');
  });
});
