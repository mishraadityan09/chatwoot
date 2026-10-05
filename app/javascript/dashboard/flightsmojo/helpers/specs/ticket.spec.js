import { getBookingId, getTicketSubject } from '../ticket';

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

  it('falls back to the API subject when the email subject is blank', () => {
    expect(
      getTicketSubject({
        additional_attributes: { mail_subject: '  ', subject: 'Name change' },
      })
    ).toBe('Name change');
  });

  it('ignores non-string values', () => {
    expect(
      getTicketSubject({ additional_attributes: { subject: { x: 1 } } })
    ).toBe('');
  });
});

describe('getBookingId', () => {
  it('reads a numeric booking id', () => {
    expect(
      getBookingId({ custom_attributes: { booking_id: '48211902' } })
    ).toBe('48211902');
  });

  it('accepts a number and trims spaces', () => {
    expect(getBookingId({ custom_attributes: { booking_id: 123 } })).toBe(
      '123'
    );
    expect(getBookingId({ custom_attributes: { booking_id: ' 456 ' } })).toBe(
      '456'
    );
  });

  it('ignores values that are not a plain numeric id', () => {
    expect(getBookingId({ custom_attributes: { booking_id: 'AB12CD' } })).toBe(
      ''
    );
    expect(
      getBookingId({ custom_attributes: { booking_id: '12345678901' } })
    ).toBe('');
    expect(
      getBookingId({ custom_attributes: { booking_id: '<b>1</b>' } })
    ).toBe('');
  });

  it('returns an empty string when there is no booking id', () => {
    expect(getBookingId({})).toBe('');
    expect(getBookingId(null)).toBe('');
    expect(getBookingId({ custom_attributes: { booking_id: null } })).toBe('');
  });
});
