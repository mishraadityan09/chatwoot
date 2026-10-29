import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import FmTicketColumnsMenu from '../FmTicketColumnsMenu.vue';
import {
  DEFAULT_TICKET_COLUMNS,
  TICKET_COLUMNS_SETTING,
} from '../ticketColumns';

const uiSettings = ref({});
const updateUISettings = vi.fn();

vi.mock('dashboard/composables/useUISettings', () => ({
  useUISettings: () => ({ uiSettings, updateUISettings }),
}));

// vuedraggable measures real layout; rendering the item slot is enough here.
const DraggableStub = defineComponent({
  props: { modelValue: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    return () =>
      h(
        'ul',
        props.modelValue.map(element =>
          h('li', { key: element.key }, slots.item({ element }))
        )
      );
  },
});

// NextButton's internals are not under test; a plain button that forwards the
// click (and the test id) is enough.
const NextButtonStub = defineComponent({
  emits: ['click'],
  setup(_, { attrs, emit }) {
    return () =>
      h('button', { ...attrs, type: 'button', onClick: e => emit('click', e) });
  },
});

const mountMenu = () =>
  mount(FmTicketColumnsMenu, {
    global: {
      stubs: {
        Draggable: DraggableStub,
        // script-setup components stub by their file name
        Button: NextButtonStub,
        NextButton: NextButtonStub,
        Icon: true,
      },
    },
  });

const byTestId = (wrapper, id) => wrapper.find(`[data-test-id="${id}"]`);
const open = async wrapper => {
  await byTestId(wrapper, 'ticket-columns-button').trigger('click');
  return byTestId(wrapper, 'ticket-columns-menu');
};

describe('FmTicketColumnsMenu', () => {
  beforeEach(() => {
    uiSettings.value = {};
    updateUISettings.mockClear();
  });

  it('opens from its button and lists shown then hidden columns', async () => {
    const wrapper = mountMenu();
    expect(byTestId(wrapper, 'ticket-columns-menu').exists()).toBe(false);

    const menu = await open(wrapper);

    expect(menu.exists()).toBe(true);
    expect(
      byTestId(menu, 'ticket-columns-item-status').find('input').element.checked
    ).toBe(true);
    expect(
      byTestId(menu, 'ticket-columns-item-id').find('input').element.checked
    ).toBe(false);
    expect(
      byTestId(menu, 'ticket-columns-item-subject').find('input').element
        .disabled
    ).toBe(true);
  });

  it('shows a hidden column', async () => {
    const wrapper = mountMenu();
    const menu = await open(wrapper);

    await byTestId(menu, 'ticket-columns-item-id').find('input').setValue(true);

    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: [...DEFAULT_TICKET_COLUMNS, 'id'],
    });
  });

  it('hides a shown column', async () => {
    const wrapper = mountMenu();
    const menu = await open(wrapper);

    await byTestId(menu, 'ticket-columns-item-channel')
      .find('input')
      .setValue(false);

    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: DEFAULT_TICKET_COLUMNS.filter(
        key => key !== 'channel'
      ),
    });
  });

  it('offers a reset only when the choice differs from the default', async () => {
    const byDefault = await open(mountMenu());
    expect(byTestId(byDefault, 'ticket-columns-reset').exists()).toBe(false);

    uiSettings.value = { [TICKET_COLUMNS_SETTING]: ['subject', 'id'] };
    const changed = await open(mountMenu());
    const reset = byTestId(changed, 'ticket-columns-reset');
    expect(reset.exists()).toBe(true);

    await reset.trigger('click');

    expect(updateUISettings).toHaveBeenLastCalledWith({
      [TICKET_COLUMNS_SETTING]: null,
    });
  });
});
