import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import SideNavLayout, { type SideNavItem } from '../../src-web/src/components/base/SideNavLayout.vue'
import { expectNoA11yViolations, mountWithVuetify } from './harness'

/**
 * Plan item 2.7 — the one side-navigation layout used by Settings, site settings and Analytics.
 */
const items: SideNavItem[] = [
  { heading: 'General' },
  { key: 'profile', label: 'Profile', icon: 'fas fa-user' },
  { key: 'sites', label: 'Sites', icon: 'fas fa-house' },
  { heading: 'Security' },
  { key: 'sessions', label: 'Active sessions', icon: 'fas fa-shield-halved' },
]

async function mountLayout(width = 1280, accept = true, sectionItems: SideNavItem[] = items) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
  const selected = ref('profile')
  const requested: string[] = []
  const Host = defineComponent({
    render: () =>
      h(
        SideNavLayout,
        {
          items: sectionItems,
          label: 'Settings sections',
          modelValue: selected.value,
          'onUpdate:modelValue': (key: string) => {
            requested.push(key)
            if (accept) selected.value = key
          },
        },
        () => h('p', { class: 'section-body' }, `Section: ${selected.value}`),
      ),
  })
  const wrapper = await mountWithVuetify(Host)
  return { wrapper, selected, requested }
}

const navItems = (wrapper: Awaited<ReturnType<typeof mountLayout>>['wrapper']) =>
  wrapper.findAll('[aria-label="Settings sections"] .v-list-item')

describe('SideNavLayout', () => {
  it('renders a labelled navigation with headings, items and the selected section', async () => {
    const { wrapper } = await mountLayout()
    expect(wrapper.find('nav[aria-label="Settings sections"]').exists()).toBe(true)
    expect(wrapper.findAll('.v-list-subheader').map(el => el.text())).toEqual(['General', 'Security'])
    expect(navItems(wrapper).map(el => el.text())).toEqual(['Profile', 'Sites', 'Active sessions'])
    const active = navItems(wrapper).filter(el => el.classes().includes('v-list-item--active'))
    expect(active.map(el => el.text())).toEqual(['Profile'])
    expect(active[0].attributes('aria-current')).toBe('page')
    expect(wrapper.find('.section-body').text()).toBe('Section: profile')
    await expectNoA11yViolations(wrapper)
  })

  it('selecting an item asks the parent; the parent decides (it may refuse)', async () => {
    const accepted = await mountLayout()
    await navItems(accepted.wrapper)[1].trigger('click')
    expect(accepted.requested).toEqual(['sites'])
    expect(accepted.wrapper.find('.section-body').text()).toBe('Section: sites')

    const refused = await mountLayout(1280, false)
    await navItems(refused.wrapper)[2].trigger('click')
    expect(refused.requested).toEqual(['sessions'])
    expect(navItems(refused.wrapper)[0].classes()).toContain('v-list-item--active')
  })

  it('does not re-emit for the section that is already selected', async () => {
    const { wrapper, requested } = await mountLayout()
    await navItems(wrapper)[0].trigger('click')
    expect(requested).toEqual([])
  })

  it('is keyboard operable: items are focusable and Enter activates', async () => {
    const { wrapper, requested } = await mountLayout()
    const sessions = navItems(wrapper)[2]
    expect(sessions.attributes('tabindex')).not.toBe('-1')
    ;(sessions.element as HTMLElement).focus()
    expect(document.activeElement).toBe(sessions.element)
    await sessions.trigger('keydown', { key: 'Enter' })
    expect(requested).toEqual(['sessions'])
    await navItems(wrapper)[1].trigger('keydown', { key: ' ' })
    expect(requested).toEqual(['sessions', 'sites'])
  })

  it('items with an href are real links: a plain click selects in-app, a modified click opens the URL', async () => {
    const linked = items.map(item => ('key' in item ? { ...item, href: `/settings/${item.key}` } : item))
    const { wrapper, requested } = await mountLayout(1280, true, linked)
    const sites = navItems(wrapper)[1]
    expect(sites.element.tagName).toBe('A')
    expect(sites.attributes('href')).toBe('/settings/sites')
    expect(sites.attributes('role')).toBe('link')
    // The list is then the navigation landmark itself (links cannot be list items).
    expect(wrapper.find('.v-list[role="navigation"][aria-label="Settings sections"]').exists()).toBe(true)

    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    sites.element.dispatchEvent(plain)
    expect(plain.defaultPrevented).toBe(true)
    expect(requested).toEqual(['sites'])

    const newTab = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
    navItems(wrapper)[2].element.dispatchEvent(newTab)
    expect(newTab.defaultPrevented).toBe(false)
    expect(requested).toEqual(['sites'])
    await expectNoA11yViolations(wrapper)
  })

  it('in rail mode (≤ 959 px) each item keeps its label as the accessible name', async () => {
    const { wrapper } = await mountLayout(800)
    await nextTick()
    expect(navItems(wrapper).map(el => el.attributes('aria-label'))).toEqual([
      'Profile',
      'Sites',
      'Active sessions',
    ])
    await expectNoA11yViolations(wrapper)
  })
})
