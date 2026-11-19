import { describe, expect, it } from 'vitest'
import IconCheckbox from '../../src-web/src/components/base/IconCheckbox.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

describe('IconCheckbox', () => {
  it('renders a real, labelled checkbox input', async () => {
    const wrapper = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: false, label: 'Enable notifications', description: 'Send a daily digest.' },
    })
    const input = wrapper.find('input[type="checkbox"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('id')).toBeTruthy()
    expect(wrapper.find('label').attributes('for')).toBe(input.attributes('id'))
    expect(input.attributes('aria-describedby')).toBe(
      wrapper.find('.icon-checkbox__description').attributes('id'),
    )
    // The square/check glyphs are still the visual.
    expect(wrapper.find('svg.svg-inline--fa').exists()).toBe(true)
    await expectNoA11yViolations(wrapper)
  })

  it('uses aria-label when no visible label is rendered', async () => {
    const wrapper = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: false, ariaLabel: 'Select Report.pdf' },
    })
    expect(wrapper.find('input').attributes('aria-label')).toBe('Select Report.pdf')
    await expectNoA11yViolations(wrapper)
  })

  it('toggles a boolean model from the keyboard and emits change', async () => {
    const wrapper = await mountWithVuetify(IconCheckbox, { props: { modelValue: false, label: 'Flag' } })
    const input = wrapper.find('input')
    ;(input.element as HTMLInputElement).focus()
    await input.setValue(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true])
    expect(wrapper.emitted('change')?.[0]).toEqual([true])
  })

  it('treats an array model as membership of `id` and never mutates the array', async () => {
    const original = ['a']
    const wrapper = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: original, id: 'b', label: 'B' },
    })
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(false)

    await wrapper.find('input').setValue(true)
    const next = wrapper.emitted('update:modelValue')?.[0]?.[0] as string[]
    expect(next).toEqual(['a', 'b'])
    expect(next).not.toBe(original)
    expect(original).toEqual(['a'])

    await wrapper.setProps({ modelValue: ['a', 'b'] })
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('input').setValue(false)
    expect(wrapper.emitted('update:modelValue')?.[1]?.[0]).toEqual(['a'])
  })

  it('does not emit when disabled', async () => {
    const wrapper = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: false, label: 'Off', disabled: true },
    })
    const input = wrapper.find('input')
    expect(input.attributes('disabled')).toBeDefined()
    await input.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('maps size names to icon sizes', async () => {
    const wrapper = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: false, size: 'large', label: 'L' },
    })
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--icon-checkbox-icon-size')).toBe('24px')
    const numeric = await mountWithVuetify(IconCheckbox, {
      props: { modelValue: false, size: 16, label: 'N' },
    })
    expect((numeric.element as HTMLElement).style.getPropertyValue('--icon-checkbox-icon-size')).toBe('16px')
  })
})
