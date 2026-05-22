import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MarkdownRenderer from '../../src-web/src/components/base/MarkdownRenderer.vue'

describe('MarkdownRenderer', () => {
  it('renders markdown and strips frontmatter by default', () => {
    const wrapper = mount(MarkdownRenderer, {
      props: {
        content: '---\ntitle: Hidden\n---\n# Visible\n\n```json\n{"ok":true}\n```',
      },
    })

    expect(wrapper.text()).toContain('Visible')
    expect(wrapper.text()).not.toContain('title: Hidden')
    expect(wrapper.html()).toContain('language-json')
  })

  it('can preserve frontmatter when requested', () => {
    const wrapper = mount(MarkdownRenderer, {
      props: { content: '---\ntitle: Visible\n---\nBody', stripFrontMatter: false },
    })
    expect(wrapper.text()).toContain('title: Visible')
  })
})
