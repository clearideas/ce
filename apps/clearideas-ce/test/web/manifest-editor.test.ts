import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ManifestEditor from '../../src-web/src/components/agents/ManifestEditor.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

/** The agent manifest editor: Tab indents, but it is never a keyboard trap (WCAG 2.1.2). */
async function mountEditor(value = '{}') {
  const wrapper = await mountWithVuetify(ManifestEditor, { props: { modelValue: value } })
  const textarea = wrapper.get('textarea').element as HTMLTextAreaElement
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    textarea.dispatchEvent(event)
    return event
  }
  return { wrapper, textarea, press }
}

describe('ManifestEditor', () => {
  it('renders JSON syntax highlighting while keeping an accessible editor', async () => {
    const manifest = '{\n  "name": "Research agent",\n  "enabled": true\n}'
    const wrapper = mount(ManifestEditor, {
      props: { modelValue: manifest },
    })

    expect(wrapper.get('textarea[aria-label="Agent manifest (JSON)"]').element).toHaveProperty(
      'value',
      manifest,
    )
    expect(wrapper.get('pre code').html()).toContain('hljs-attr')
    expect(wrapper.get('pre code').html()).toContain('hljs-string')
    expect(wrapper.text()).toContain('JSON · 4 lines')

    await wrapper.get('textarea').setValue('{"name":"Updated"}')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['{"name":"Updated"}'])
  })

  it('shows a clear invalid JSON state', () => {
    const wrapper = mount(ManifestEditor, {
      props: { modelValue: '{', error: true },
    })

    expect(wrapper.classes()).toContain('manifest-field--error')
    expect(wrapper.text()).toContain('Manifest must be valid JSON.')
  })

  it('Tab inserts two spaces at the cursor', async () => {
    const { wrapper, textarea, press } = await mountEditor('{}')
    textarea.setSelectionRange(1, 1)
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['{  }'])
  })

  it('Shift+Tab and Escape-then-Tab move focus instead of indenting', async () => {
    const { wrapper, press } = await mountEditor()
    expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(false)
    press('Escape')
    expect(press('Tab').defaultPrevented).toBe(false)
    // Only the next Tab: indenting resumes afterwards.
    expect(press('Tab').defaultPrevented).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  })

  it('describes the keys and keeps the decorative highlight out of the Tab order', async () => {
    const { wrapper, textarea } = await mountEditor()
    const hint = document.getElementById(textarea.getAttribute('aria-describedby')!)
    expect(hint?.textContent).toContain('Press Escape, then Tab')
    expect(wrapper.get('pre').attributes('tabindex')).toBe('-1')
    await expectNoA11yViolations(wrapper)
  })
})
