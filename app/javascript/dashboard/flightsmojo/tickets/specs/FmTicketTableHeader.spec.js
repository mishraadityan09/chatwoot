import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import FmTicketTableHeader from '../FmTicketTableHeader.vue';

const stats = ref({ allCount: 138, updatedOn: new Date() });

vi.mock('dashboard/composables/store', () => ({
  useMapGetter: () => stats,
  useStore: () => ({ dispatch: vi.fn(), getters: {} }),
}));

const byTestId = (wrapper, id) => wrapper.find(`[data-test-id="${id}"]`);

describe('FmTicketTableHeader', () => {
  beforeEach(() => {
    stats.value = { allCount: 138, updatedOn: new Date() };
  });

  it('shows loaded of total tickets in a folder view', () => {
    const wrapper = mount(FmTicketTableHeader, {
      props: { loadedCount: 25, foldersId: 8 },
    });

    expect(byTestId(wrapper, 'ticket-summary').text()).toBe(
      'FLIGHTSMOJO.TICKETS.SUMMARY.FOLDER'
    );
  });

  it('shows the loaded count outside folder views', () => {
    const wrapper = mount(FmTicketTableHeader, { props: { loadedCount: 11 } });

    expect(byTestId(wrapper, 'ticket-summary').text()).toBe(
      'FLIGHTSMOJO.TICKETS.SUMMARY.LOADED'
    );
  });

  it('says updated just now for a fresh list', () => {
    const wrapper = mount(FmTicketTableHeader, { props: { loadedCount: 1 } });

    expect(byTestId(wrapper, 'ticket-updated').text()).toBe(
      'FLIGHTSMOJO.TICKETS.UPDATED_JUST_NOW'
    );
  });

  it('shows how long ago the list was updated', () => {
    stats.value = {
      allCount: 3,
      updatedOn: new Date(Date.now() - 5 * 60 * 1000),
    };
    const wrapper = mount(FmTicketTableHeader, { props: { loadedCount: 1 } });

    expect(byTestId(wrapper, 'ticket-updated').text()).toBe(
      'FLIGHTSMOJO.TICKETS.UPDATED_AGO'
    );
  });

  it('renders all column titles', () => {
    const text = mount(FmTicketTableHeader).text();

    [
      'STATUS',
      'SUBJECT',
      'REQUESTER',
      'REQUESTED',
      'PRIORITY',
      'GROUP',
      'ASSIGNEE',
      'CHANNEL',
      'UPDATED',
    ].forEach(column =>
      expect(text).toContain(`FLIGHTSMOJO.TICKETS.COLUMNS.${column}`)
    );
  });
});
