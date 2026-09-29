// FlightsMojo: covers the preferBody prop added for the card's subject row.
import { shallowMount } from '@vue/test-utils';
import MessagePreview from '../MessagePreview.vue';

const emailMessage = {
  content: 'Hi, I have been waiting three days for my refund.',
  content_attributes: { email: { subject: 'Refund not received' } },
  message_type: 0,
  attachments: [],
};

const mountPreview = props =>
  shallowMount(MessagePreview, {
    props: { message: emailMessage, ...props },
    global: { stubs: { 'fluent-icon': true } },
  });

describe('MessagePreview', () => {
  it('shows the email subject by default', () => {
    expect(mountPreview().text()).toContain('Refund not received');
  });

  it('shows the message body when preferBody is set', () => {
    const text = mountPreview({ preferBody: true }).text();
    expect(text).toContain('waiting three days');
    expect(text).not.toContain('Refund not received');
  });

  it('shows plain chat messages unchanged when preferBody is set', () => {
    const wrapper = mountPreview({
      preferBody: true,
      message: { ...emailMessage, content_attributes: {} },
    });
    expect(wrapper.text()).toContain('waiting three days');
  });
});
