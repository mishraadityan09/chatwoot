// FlightsMojo: a required attribute with a pattern (e.g. booking id = digits) is
// "missing" when the saved value breaks the pattern. Kept apart from upstream's
// useConversationRequiredAttributes.spec.js so that file merges cleanly.
import { useConversationRequiredAttributes } from 'dashboard/composables/useConversationRequiredAttributes';
import { useMapGetter } from 'dashboard/composables/store';
import { useAccount } from 'dashboard/composables/useAccount';

vi.mock('dashboard/composables/store');
vi.mock('dashboard/composables/useAccount');

const bookingAttribute = {
  attributeKey: 'booking_id',
  attributeDisplayName: 'Booking ID',
  attributeDisplayType: 'text',
  attributeValues: [],
  regexPattern: '/^\\d{1,10}$/',
  regexCue: 'Digits only',
};

const setup = attributes => {
  useMapGetter.mockImplementation(getter => {
    if (getter === 'accounts/isFeatureEnabledonAccount') {
      return { value: () => true };
    }
    if (getter === 'attributes/getConversationAttributes') {
      return { value: attributes };
    }
    return { value: null };
  });
  useAccount.mockReturnValue({
    currentAccount: {
      value: {
        settings: { conversation_required_attributes: ['booking_id'] },
      },
    },
    accountId: { value: 1 },
  });
  return useConversationRequiredAttributes().checkMissingAttributes;
};

describe('required attribute with a pattern', () => {
  it('accepts a value that matches', () => {
    const check = setup([bookingAttribute]);
    expect(check({ booking_id: '48211902' }).hasMissing).toBe(false);
  });

  it('treats a value that breaks the pattern as missing', () => {
    const check = setup([bookingAttribute]);
    const { hasMissing, missing } = check({ booking_id: 'AB12CD' });

    expect(hasMissing).toBe(true);
    expect(missing[0].value).toBe('booking_id');
  });

  it('still treats an empty value as missing', () => {
    expect(setup([bookingAttribute])({}).hasMissing).toBe(true);
  });

  it('only checks presence when the attribute has no pattern', () => {
    const check = setup([{ ...bookingAttribute, regexPattern: null }]);
    expect(check({ booking_id: 'AB12CD' }).hasMissing).toBe(false);
  });

  it('does not block resolving when the pattern itself is broken', () => {
    const check = setup([{ ...bookingAttribute, regexPattern: '/(/' }]);
    expect(check({ booking_id: 'AB12CD' }).hasMissing).toBe(false);
  });
});
