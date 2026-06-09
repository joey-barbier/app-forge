import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { DS_BUTTON_VARIANTS, DSButton } from '../index'

// Mounts standalone — no Nuxt context. DS components must stay testable this way
// (ARCHITECTURE.md §7: fast ground truth without the browser).
describe('DSButton', () => {
  it('renders slot content', () => {
    const wrapper = mount(DSButton, { slots: { default: 'Save changes' } })
    expect(wrapper.text()).toBe('Save changes')
  })

  it('defaults to the primary variant', () => {
    const wrapper = mount(DSButton)
    expect(wrapper.classes()).toContain('ds-button--primary')
  })

  it.each(DS_BUTTON_VARIANTS)('applies the %s variant class', (variant) => {
    const wrapper = mount(DSButton, { props: { variant } })
    expect(wrapper.classes()).toContain(`ds-button--${variant}`)
  })

  it('emits click when enabled', async () => {
    const wrapper = mount(DSButton)
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('swallows click when disabled', async () => {
    const wrapper = mount(DSButton, { props: { disabled: true } })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
  })
})
