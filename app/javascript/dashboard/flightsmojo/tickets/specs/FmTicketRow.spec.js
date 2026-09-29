import { computed } from 'vue';
import { mount } from '@vue/test-utils';
import FmTicketRow from '../FmTicketRow.vue';
import { TICKET_GROUPS_KEY } from '../ticketTable';

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

const mountRow = ({ chat = {}, props = {}, groups = new Map() } = {}) =>
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
      provide: { [TICKET_GROUPS_KEY]: computed(() => groups) },
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
    expect(byTestId(wrapper, 'ticket-status').classes()).toContain(
      'bg-n-ruby-3'
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
});
