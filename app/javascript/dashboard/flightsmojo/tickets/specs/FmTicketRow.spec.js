import { computed } from 'vue';
import { mount } from '@vue/test-utils';
import FmTicketRow from '../FmTicketRow.vue';
import { TICKET_GROUPS_KEY } from '../ticketTable';
import {
  TICKET_COLUMNS,
  TICKET_COLUMNS_KEY,
  gridStyleFor,
} from '../ticketColumns';

vi.mock('dashboard/composables/store', async () => {
  const { ref } = await import('vue');
  return {
    useMapGetter: () => ref([{ title: 'refund', color: '#EF4123' }]),
  };
});

const baseChat = {
  id: 7,
  status: 'open',
  priority: 'high',
  unread_count: 0,
  labels: [],
  messages: [
    { id: 1, content: 'Hi, my card was charged twice', message_type: 0 },
  ],
  meta: { team: { name: 'refunds' } },
  additional_attributes: { mail_subject: 'Double charged on card' },
  created_at: 1727600000,
  timestamp: 1727600000,
};

const columnsContext = keys => ({
  keys: computed(() => keys),
  columns: computed(() => keys.map(key => TICKET_COLUMNS[key])),
  gridStyle: computed(() => gridStyleFor(keys)),
});

const mountRow = ({
  chat = {},
  props = {},
  groups = new Map(),
  columns = null,
} = {}) =>
  mount(FmTicketRow, {
    props: {
      chat: { ...baseChat, ...chat },
      currentContact: { name: 'Fatima Khan', thumbnail: '' },
      assignee: { name: 'Priya Agent' },
      inbox: { id: 1, name: 'USA Email' },
      showAssignee: true,
      showInboxName: true,
      ...props,
    },
    global: {
      provide: {
        [TICKET_GROUPS_KEY]: computed(() => groups),
        ...(columns ? { [TICKET_COLUMNS_KEY]: columnsContext(columns) } : {}),
      },
      stubs: {
        Avatar: true,
        Checkbox: true,
        InboxName: true,
        CardPriorityIcon: true,
        UnreadBadge: true,
        Icon: true,
      },
    },
  });

const byTestId = (wrapper, id) => wrapper.find(`[data-test-id="${id}"]`);

describe('FmTicketRow', () => {
  it('renders the ticket columns', () => {
    const wrapper = mountRow();
    const text = wrapper.text();

    expect(byTestId(wrapper, 'ticket-subject').text()).toBe(
      'Double charged on card'
    );
    expect(byTestId(wrapper, 'ticket-status').text()).toBe(
      'FLIGHTSMOJO.TICKETS.STATUS.OPEN'
    );
    expect(byTestId(wrapper, 'ticket-status-dot').classes()).toContain(
      'bg-n-ruby-9'
    );
    expect(text).toContain('Fatima Khan');
    expect(text).toContain('FLIGHTSMOJO.TICKETS.PRIORITY.HIGH');
    expect(text).toContain('refunds');
    expect(text).toContain('Priya Agent');
    expect(wrapper.findComponent({ name: 'InboxName' }).exists()).toBe(true);
  });

  it('keeps the classes keyboard navigation relies on', () => {
    const wrapper = mountRow({ props: { isActiveChat: true } });
    const row = byTestId(wrapper, 'ticket-row');

    expect(row.classes()).toContain('conversation');
    expect(row.classes()).toContain('active');
  });

  it('falls back to the last message when there is no subject', () => {
    const wrapper = mountRow({ chat: { additional_attributes: {} } });
    const subject = byTestId(wrapper, 'ticket-subject');

    expect(subject.text()).toBe('Hi, my card was charged twice');
    expect(subject.classes()).toContain('text-n-slate-11');
  });

  it('shows the first label with a count of the rest', () => {
    const wrapper = mountRow({ chat: { labels: ['refund', 'vip', 'irop'] } });
    const labels = byTestId(wrapper, 'ticket-labels');

    expect(labels.text()).toContain('refund');
    expect(labels.text()).toContain('FLIGHTSMOJO.TICKETS.MORE_LABELS');
    expect(labels.attributes('title')).toBe('refund, vip, irop');
  });

  it('follows upstream visibility rules for assignee and channel', () => {
    const wrapper = mountRow({
      props: { showAssignee: false, isInboxView: true },
    });

    expect(wrapper.text()).not.toContain('Priya Agent');
    expect(wrapper.findComponent({ name: 'InboxName' }).exists()).toBe(false);
  });

  it('renders a priority group header when the row starts a group', () => {
    const wrapper = mountRow({
      groups: new Map([[7, { key: 'HIGH', count: 4 }]]),
    });
    const header = byTestId(wrapper, 'ticket-group-header');

    expect(header.text()).toContain('FLIGHTSMOJO.TICKETS.PRIORITY.HIGH');
    expect(header.text()).toContain('4');
  });

  it('renders no group header otherwise', () => {
    expect(byTestId(mountRow(), 'ticket-group-header').exists()).toBe(false);
  });

  it('emits click and opens the context menu from the actions button', async () => {
    const wrapper = mountRow();

    await byTestId(wrapper, 'ticket-row').trigger('click');
    await wrapper.find('button[aria-label]').trigger('click');

    expect(wrapper.emitted('click')).toHaveLength(1);
    expect(wrapper.emitted('contextmenu')).toHaveLength(1);
  });

  it('emits selection changes from the checkbox', async () => {
    const wrapper = mountRow();
    const checkbox = wrapper.findComponent({ name: 'Checkbox' });

    await checkbox.vm.$emit('update:modelValue', true);
    await checkbox.vm.$emit('update:modelValue', false);

    expect(wrapper.emitted('selectConversation')).toHaveLength(1);
    expect(wrapper.emitted('deSelectConversation')).toHaveLength(1);
  });

  it('renders only the chosen columns, in their order', () => {
    const wrapper = mountRow({ columns: ['updated', 'subject'] });
    const cells = byTestId(wrapper, 'ticket-row').findAll(':scope > div');

    expect(byTestId(wrapper, 'ticket-status').exists()).toBe(false);
    // checkbox, updated, subject, row menu
    expect(cells).toHaveLength(4);
    expect(cells[2].find('[data-test-id="ticket-subject"]').exists()).toBe(
      true
    );
  });

  const EXTRA_COLUMNS = [
    'subject',
    'id',
    'booking_id',
    'labels',
    'email',
    'first_response',
    'waiting_since',
  ];

  it('renders the extra columns when they are chosen', () => {
    const wrapper = mountRow({
      columns: EXTRA_COLUMNS,
      chat: {
        custom_attributes: { booking_id: '48211902' },
        labels: ['refund', 'vip'],
        first_reply_created_at: baseChat.created_at + 90 * 60,
        waiting_since: baseChat.created_at,
      },
      props: {
        currentContact: { name: 'Fatima Khan', email: 'fatima@example.test' },
      },
    });

    expect(byTestId(wrapper, 'ticket-id').text()).toBe('#7');
    expect(byTestId(wrapper, 'ticket-booking-id').text()).toBe('48211902');
    expect(byTestId(wrapper, 'ticket-email').text()).toBe(
      'fatima@example.test'
    );
    expect(byTestId(wrapper, 'ticket-first-response').text()).toBe('1h 30m');
    expect(byTestId(wrapper, 'ticket-waiting-since').text()).not.toBe(
      'FLIGHTSMOJO.TICKETS.EMPTY_VALUE'
    );
    // the labels move out of the subject cell into their own column
    expect(wrapper.findAll('[data-test-id="ticket-labels"]')).toHaveLength(1);
    expect(byTestId(wrapper, 'ticket-labels-column').text()).toContain(
      'refund'
    );
  });

  it('shows a dash where an extra column has no value', () => {
    const wrapper = mountRow({ columns: EXTRA_COLUMNS });

    [
      'ticket-booking-id',
      'ticket-email',
      'ticket-first-response',
      'ticket-waiting-since',
      'ticket-labels-column',
    ].forEach(id =>
      expect(byTestId(wrapper, id).text()).toBe(
        'FLIGHTSMOJO.TICKETS.EMPTY_VALUE'
      )
    );
  });

  it('shows unread as a quiet count, capped at 99+', () => {
    expect(byTestId(mountRow(), 'ticket-unread').exists()).toBe(false);
    expect(
      byTestId(mountRow({ chat: { unread_count: 3 } }), 'ticket-unread').text()
    ).toBe('3');
    expect(
      byTestId(
        mountRow({ chat: { unread_count: 120 } }),
        'ticket-unread'
      ).text()
    ).toBe('99+');
  });
});
