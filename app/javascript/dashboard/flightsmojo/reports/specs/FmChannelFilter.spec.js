import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import FmChannelFilter from '../FmChannelFilter.vue';
import ComboBox from 'dashboard/components-next/combobox/ComboBox.vue';

const inboxes = ref([
  { id: 7, name: 'USA.Chat' },
  { id: 3, name: 'India.Mail' },
]);

vi.mock('dashboard/composables/store', () => ({
  useMapGetter: () => inboxes,
  useStore: () => ({ dispatch: vi.fn(), getters: {} }),
}));

describe('FmChannelFilter', () => {
  it('offers All channels plus every inbox, sorted by name', () => {
    const wrapper = mount(FmChannelFilter);
    const options = wrapper.findComponent(ComboBox).props('options');

    expect(options.map(o => o.label)).toEqual([
      'FLIGHTSMOJO.REPORTS.CHANNEL.ALL',
      'India.Mail',
      'USA.Chat',
    ]);
  });

  it('shows All channels when nothing is selected', () => {
    const wrapper = mount(FmChannelFilter);

    expect(wrapper.findComponent(ComboBox).props('modelValue')).toBe('all');
    expect(wrapper.text()).toContain('FLIGHTSMOJO.REPORTS.CHANNEL.ALL');
  });

  it('emits the inbox id when a channel is picked', async () => {
    const wrapper = mount(FmChannelFilter);

    await wrapper.findComponent(ComboBox).vm.$emit('update:modelValue', 3);

    expect(wrapper.emitted('update:modelValue')).toEqual([[3]]);
  });

  it('emits null when the filter is cleared or All channels is picked', async () => {
    const wrapper = mount(FmChannelFilter, { props: { modelValue: 3 } });
    const combo = wrapper.findComponent(ComboBox);

    expect(combo.props('modelValue')).toBe(3);

    await combo.vm.$emit('update:modelValue', '');
    await combo.vm.$emit('update:modelValue', 'all');

    expect(wrapper.emitted('update:modelValue')).toEqual([[null], [null]]);
  });

  it('does not emit when the value is unchanged', async () => {
    const wrapper = mount(FmChannelFilter);

    await wrapper.findComponent(ComboBox).vm.$emit('update:modelValue', 'all');

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
