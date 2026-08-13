import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ManifestEditor from '../../src-web/src/components/agents/ManifestEditor.vue'

describe('ManifestEditor', () => {
  it('renders JSON syntax highlighting while keeping an accessible editor', async () => {
    const manifest = '{\n  "name": "Research agent",\n  "enabled": true\n}'
    const wrapper = mount(ManifestEditor, {
      props: { modelValue: manifest },
    })

    expect(wrapper.get('textarea[aria-label="Agent manifest (JSON)"]').element).toHaveProperty('value', manifest)
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
})
