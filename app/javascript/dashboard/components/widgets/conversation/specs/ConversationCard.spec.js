import { shallowMount } from '@vue/test-utils';
import ConversationCard from '../ConversationCard.vue';

const defaultChat = {
  id: 1,
  labels: [],
  messages: [],
  priority: null,
  unread_count: 0,
  timestamp: 1700000000,
  created_at: 1700000000,
};

const mountComponent = (chat, currentContact = {}, props = {}) =>
  shallowMount(ConversationCard, {
    props: {
      chat: { ...defaultChat, ...chat },
      currentContact: {
        name: 'Jane Doe',
        thumbnail: '',
        availability_status: 'offline',
        ...currentContact,
      },
      inbox: { id: 1 },
      ...props,
    },
    global: {
      stubs: {
        'fluent-icon': true,
      },
    },
  });

describe('ConversationCard', () => {
  it('does not reserve the labels row when only a persisted SLA policy id is present', () => {
    const wrapper = mountComponent({ sla_policy_id: 1, applied_sla: null });

    expect(wrapper.findComponent({ name: 'CardLabels' }).exists()).toBe(false);
  });

  it('shows the labels row when an active applied SLA is present', () => {
    const wrapper = mountComponent({
      sla_policy_id: 1,
      applied_sla: { id: 1 },
    });

    expect(wrapper.findComponent({ name: 'CardLabels' }).exists()).toBe(true);
  });

  it('does not reserve the labels row when the contact is blocked', () => {
    const wrapper = mountComponent(
      {
        sla_policy_id: 1,
        applied_sla: { id: 1 },
      },
      { blocked: true }
    );

    expect(wrapper.findComponent({ name: 'CardLabels' }).exists()).toBe(false);
  });

  it('uses the bot icon for a Captain assignee', () => {
    const wrapper = mountComponent(
      { meta: { assignee_type: 'Captain::Assistant' } },
      {},
      { showAssignee: true, assignee: { name: 'Captain' } }
    );

    expect(wrapper.findComponent({ name: 'Icon' }).props('icon')).toBe(
      'i-lucide-bot'
    );
  });
});

// FlightsMojo (FM-35): the status dot before the name, shared with the tabs.
describe('ConversationCard status dot', () => {
  const mountWithStatus = status =>
    shallowMount(ConversationCard, {
      props: {
        chat: {
          id: 7,
          status,
          unread_count: 0,
          messages: [],
          meta: {},
          additional_attributes: {},
          custom_attributes: {},
          labels: [],
        },
        currentContact: { name: 'Fatima Khan', availability_status: 'offline' },
      },
      global: { directives: { tooltip: {} } },
    });

  it('colours the dot by status and names it for screen readers', () => {
    const open = mountWithStatus('open').find(
      '[data-test-id="conversation-status-dot"]'
    );
    expect(open.classes()).toContain('bg-n-ruby-9');
    expect(open.attributes('aria-label')).toBe(
      'FLIGHTSMOJO.TICKETS.STATUS.OPEN'
    );

    expect(
      mountWithStatus('resolved')
        .find('[data-test-id="conversation-status-dot"]')
        .classes()
    ).toContain('bg-n-teal-9');
  });
});
