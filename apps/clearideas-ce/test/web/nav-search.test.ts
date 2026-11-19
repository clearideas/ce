import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createTestingPinia } from '@pinia/testing'
import { describe, expect, it, vi } from 'vitest'
import NavSearchBar from '../../src-web/src/layouts/components/NavSearchBar.vue'
import { useContentStore } from '../../src-web/src/stores/content.store'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

vi.mock('../../src-web/src/api/client', () => ({ ceApi: {}, api: {} }))

async function mountSearch(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
  const contentStore = useContentStore(pinia)
  const wrapper = await mountWithVuetify(NavSearchBar, {
    props: { modelValue: false },
    global: { plugins: [pinia] },
    routes: [{ path: '/:pathMatch(.*)*', name: 'any', component: { template: '<div />' } }],
  })
  await settle()
  return { wrapper, contentStore }
}

describe('navbar search (plan item 3.9)', () => {
  it('is always visible on desktop, with a placeholder, a keyboard-shortcut hint and search semantics', async () => {
    const { wrapper } = await mountSearch(1280)
    expect(wrapper.find('[role="search"]').exists()).toBe(true)
    expect(wrapper.find('.search-collapsed-button').exists()).toBe(false)
    const editor = wrapper.find('[role="textbox"]')
    expect(editor.exists()).toBe(true)
    expect(editor.attributes('aria-multiline')).toBe('false')
    expect(editor.attributes('aria-label')).toBe('Search all sites')
    expect(wrapper.find('.search-shortcut').text()).toMatch(/⌘K|Ctrl K/)
    await expectNoA11yViolations(wrapper)
  })

  it('fills the navbar width when the input is shown so the placeholder has room (regression)', async () => {
    // jsdom does not lay out, so assert the contract: the expanded shell carries the class the
    // stylesheet sizes to 100%, and the placeholder is rendered with the site-aware text.
    const { wrapper } = await mountSearch(1280)
    expect(wrapper.find('.search-shell').classes()).toContain('is-expanded')
    expect(wrapper.find('.handlebars-textarea-placeholder').text()).toBe('Search all sites')
    // The sizing rule must apply at every breakpoint (it used to live only in a mobile media query).
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src-web/src/layouts/components/NavSearchBar.vue'),
      'utf8',
    )
    const style = source.slice(source.indexOf('<style'))
    const rule = style.match(/\.search-shell\.is-expanded\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/width:\s*100%/)
    const mediaBlocks = style.match(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g) ?? []
    expect(mediaBlocks.some(block => block.includes('.search-shell.is-expanded'))).toBe(false)
  })

  it('renders the placeholder at medium emphasis (>= 4.5:1 in both themes), not disabled opacity', () => {
    // axe (e2e) measures the real contrast; this guards the token so the regression cannot return silently.
    const source = readFileSync(
      resolve(import.meta.dirname, '../../src-web/src/components/base/HandlebarsTextarea.vue'),
      'utf8',
    )
    const rule = source.match(/\.handlebars-textarea-placeholder\s*\{[^}]*\}/)?.[0] ?? ''
    expect(rule).toMatch(/color:\s*rgba\(var\(--v-theme-on-surface\),\s*var\(--v-medium-emphasis-opacity\)\)/)
    expect(rule).not.toMatch(/0\.38/)
  })

  it('collapses to a named button on narrow screens', async () => {
    const { wrapper } = await mountSearch(390)
    const button = wrapper.find('.search-collapsed-button')
    expect(button.exists()).toBe(true)
    expect(button.attributes('aria-label')).toBe('Search content')
    expect(wrapper.find('[role="textbox"]').exists()).toBe(false)
  })

  it('keeps metadata highlighting: a complete token is marked, an incomplete one blocks submit', async () => {
    const { wrapper, contentStore } = await mountSearch(1280)
    contentStore.searchQuery = '@contentType:application/pdf budget'
    await settle()
    expect(wrapper.find('.metadata-search-token').text()).toBe('@contentType:application/pdf')

    contentStore.searchQuery = '@contentType:'
    await settle()
    await wrapper.find('[role="textbox"]').trigger('keydown', { key: 'Enter' })
    await settle()
    expect(contentStore.search).not.toHaveBeenCalled()

    contentStore.searchQuery = 'budget'
    await settle()
    await wrapper.find('[role="textbox"]').trigger('keydown', { key: 'Enter' })
    await settle()
    expect(contentStore.search).toHaveBeenCalledTimes(1)
    expect(contentStore.showSearchResults).toBe(true)
  })
})
