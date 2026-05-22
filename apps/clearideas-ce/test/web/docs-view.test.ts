import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import DocsView from '../../src-web/src/views/DocsView.vue'

const route = reactive<{ params: Record<string, any> }>({ params: {} })
const replace = vi.fn(async (target: any) => {
  route.params.slug = target.params.slug
})

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ replace }),
  RouterLink: { template: '<a><slot /></a>' },
}))

describe('DocsView', () => {
  beforeEach(() => {
    route.params = {}
    replace.mockClear()
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/docs/index.json') {
        return jsonResponse({
          title: 'Clear Ideas Community Edition',
          description: 'Docs',
          sections: [
            {
              title: 'Start',
              pages: [
                { title: 'Getting Started', slug: 'getting-started', description: 'Run it' },
                { title: 'Security', slug: 'security-model', description: 'Harden it' },
              ],
            },
          ],
        })
      }
      if (url === '/docs/getting-started.md') return textResponse('# Getting Started\n\nWelcome.')
      if (url === '/docs/security-model.md') return textResponse('# Security\n\nUse HTTPS.')
      return new Response('missing', { status: 404 })
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the default docs page and renders markdown', async () => {
    const wrapper = mount(DocsView, {
      global: { stubs: ['RouterLink', 'VProgressCircular', 'VAlert'] },
    })

    await flushPromises()

    expect(wrapper.text()).toContain('Clear Ideas Community Edition')
    expect(wrapper.text()).toContain('Getting Started')
    expect(wrapper.html()).toContain('<h1>Getting Started</h1>')
  })

  it('redirects unknown slugs to the first docs page', async () => {
    route.params.slug = 'unknown'
    mount(DocsView, {
      global: { stubs: ['RouterLink', 'VProgressCircular', 'VAlert'] },
    })

    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ name: 'docs-page', params: { slug: 'getting-started' } })
  })
})

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  })
}

function textResponse(body: string) {
  return new Response(body, {
    headers: { 'content-type': 'text/markdown' },
  })
}
