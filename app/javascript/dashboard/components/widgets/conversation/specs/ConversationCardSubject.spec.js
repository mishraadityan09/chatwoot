// FlightsMojo: the ticket subject row on the conversation card. Kept out of
// upstream's ConversationCard.spec.js so that file merges cleanly.
import { shallowMount } from '@vue/test-utils';
import ConversationCard from '../ConversationCard.vue';

const lastMessage = {
  id: 10,
  content: 'Hi, I have been waiting three days for my refund.',
  content_attributes: { email: { subject: 'Refund not received' } },
  message_type: 0,
  created_at: 1700000000,
  attachments: [],
};

const defaultChat = {
  id: 1,
  labels: [],
  messages: [lastMessage],
  priority: null,
  unread_count: 0,
  timestamp: 1700000000,
  created_at: 1700000000,
};

const mountCard = chat =>
  shallowMount(ConversationCard, {
    props: {
      chat: { ...defaultChat, ...chat },
      currentContact: { name: 'Jane Doe', thumbnail: '' },
      inbox: { id: 1 },
    },
    global: { stubs: { 'fluent-icon': true } },
  });

const subjectRow = wrapper =>
  wrapper.find('[data-test-id="conversation-subject"]');

describe('ConversationCard ticket subject', () => {
  it('shows the email subject and asks the preview for the body', () => {
    const wrapper = mountCard({
      additional_attributes: { mail_subject: 'Refund not received' },
    });

    expect(subjectRow(wrapper).text()).toBe('Refund not received');
    expect(subjectRow(wrapper).attributes('title')).toBe('Refund not received');
    expect(
      wrapper.findComponent({ name: 'MessagePreview' }).props('preferBody')
    ).toBe(true);
  });

  it('shows the subject of an API (website) ticket', () => {
    const wrapper = mountCard({
      additional_attributes: { subject: 'Name correction on e-ticket' },
    });

    expect(subjectRow(wrapper).text()).toBe('Name correction on e-ticket');
  });

  it('adds no row and keeps the default preview when there is no subject', () => {
    const wrapper = mountCard({ additional_attributes: {} });

    expect(subjectRow(wrapper).exists()).toBe(false);
    expect(
      wrapper.findComponent({ name: 'MessagePreview' }).props('preferBody')
    ).toBe(false);
  });

  it('makes room for the unread badge', () => {
    const wrapper = mountCard({
      unread_count: 2,
      additional_attributes: { subject: 'Baggage allowance' },
    });

    expect(subjectRow(wrapper).classes()).toContain('pe-6');
    expect(subjectRow(wrapper).classes()).toContain('font-medium');
  });

  it('keeps the body secondary on unread tickets with a subject', () => {
    const wrapper = mountCard({
      unread_count: 2,
      additional_attributes: { subject: 'Baggage allowance' },
    });
    const preview = wrapper.findComponent({ name: 'MessagePreview' });

    expect(preview.classes()).toContain('text-n-slate-11');
    expect(preview.classes()).not.toContain('font-medium');
  });

  it('keeps upstream unread emphasis when there is no subject', () => {
    const wrapper = mountCard({ unread_count: 2, additional_attributes: {} });
    const preview = wrapper.findComponent({ name: 'MessagePreview' });

    expect(preview.classes()).toContain('font-medium');
    expect(preview.classes()).toContain('text-n-slate-12');
  });
});
