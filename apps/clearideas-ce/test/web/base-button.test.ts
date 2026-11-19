import { describe, expect, it, vi } from 'vitest'
import BaseButton from '../../src-web/src/components/base/BaseButton.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

describe('BaseButton', () => {
  it.each([
    ['primary', ['bg-primary', 'v-btn--variant-flat']],
    ['secondary', ['text-secondary', 'v-btn--variant-tonal']],
    ['tertiary', ['text-secondary', 'v-btn--variant-text']],
    ['danger', ['bg-error', 'v-btn--variant-flat']],
  ] as const)('renders the %s intent with its colour and variant', async (intent, classes) => {
    const wrapper = await mountWithVuetify(BaseButton, { props: { text: intent, intent } })
    for (const cls of classes) expect(wrapper.find('button').classes(), intent).toContain(cls)
  })

  it('lets explicit color/variant override the intent mapping', async () => {
    const wrapper = await mountWithVuetify(BaseButton, {
      props: { text: 'x', intent: 'primary', color: 'success', variant: 'outlined' },
    })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('text-success')
    expect(classes).toContain('v-btn--variant-outlined')
  })

  it('renders an icon-only button with its accessible name from aria-label or tooltip', async () => {
    const labelled = await mountWithVuetify(BaseButton, {
      props: { icon: 'fas fa-gear', ariaLabel: 'Settings' },
    })
    expect(labelled.find('button').classes()).toContain('v-btn--icon')
    expect(labelled.find('button').attributes('aria-label')).toBe('Settings')
    await expectNoA11yViolations(labelled)

    const tooltipOnly = await mountWithVuetify(BaseButton, {
      props: { icon: 'fas fa-gear', tooltip: 'Open settings' },
    })
    expect(tooltipOnly.find('button').attributes('aria-label')).toBe('Open settings')
  })

  it('draws a filled-intent icon-only button as a coloured icon (icon buttons never show a fill)', async () => {
    // A flat primary icon button would render its white on-primary icon on the page background.
    const primary = await mountWithVuetify(BaseButton, {
      props: { icon: 'fas fa-cloud-arrow-up', ariaLabel: 'Upload files', intent: 'primary' },
    })
    const classes = primary.find('button').classes()
    expect(classes).toContain('v-btn--variant-text')
    expect(classes).toContain('text-primary')
    expect(classes).not.toContain('bg-primary')
    const danger = await mountWithVuetify(BaseButton, {
      props: { icon: 'fas fa-trash', ariaLabel: 'Delete', intent: 'danger' },
    })
    expect(danger.find('button').classes()).toContain('text-error')
  })

  it('treats icon + text as a leading icon, not icon-only', async () => {
    const wrapper = await mountWithVuetify(BaseButton, { props: { icon: 'fas fa-plus', text: 'New site' } })
    const button = wrapper.find('button')
    expect(button.classes()).not.toContain('v-btn--icon')
    expect(button.text()).toContain('New site')
    expect(button.find('.v-btn__prepend svg').exists()).toBe(true)
  })

  it('warns in development when an icon-only button has no accessible name', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await mountWithVuetify(BaseButton, { props: { icon: 'fas fa-gear' } })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('aria-label'))
    warn.mockRestore()
  })

  it('forwards click, type, disabled and loading to the underlying button', async () => {
    const onClick = vi.fn()
    const wrapper = await mountWithVuetify(BaseButton, {
      props: { text: 'Submit', type: 'submit', onClick },
    })
    const button = wrapper.find('button')
    expect(button.attributes('type')).toBe('submit')
    await button.trigger('click')
    expect(onClick).toHaveBeenCalledTimes(1)

    await wrapper.setProps({ disabled: true })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()

    await wrapper.setProps({ disabled: false, loading: true })
    expect(wrapper.find('.v-btn__loader').exists()).toBe(true)
  })

  it('passes unknown attributes (class, data-*, form) through to the button element', async () => {
    const wrapper = await mountWithVuetify(BaseButton, {
      props: { text: 'Save' },
      attrs: { class: 'custom', 'data-test': 'save', form: 'my-form' },
    })
    const button = wrapper.find('button')
    expect(button.classes()).toContain('custom')
    expect(button.attributes('data-test')).toBe('save')
    expect(button.attributes('form')).toBe('my-form')
  })
})
