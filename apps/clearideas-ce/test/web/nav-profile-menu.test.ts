import { beforeEach, describe, expect, it, vi } from 'vitest'
import NavUserProfileMenu from '../../src-web/src/layouts/components/NavUserProfileMenu.vue'
import type { Session } from '../../src-web/src/types/domain'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

const { getAppConfig } = vi.hoisted(() => ({ getAppConfig: vi.fn() }))

vi.mock('../../src-web/src/api/client', () => ({
  appConfigApi: { get: getAppConfig },
}))

const session: Session = { user: { id: 'user-1', name: 'CE User', email: 'ce@example.test' } }
const stub = { template: '<div />' }

/** VMenu teleports its content to document.body; query there. */
function menuItems() {
  return [...document.body.querySelectorAll('.v-overlay .v-list-item')].filter(
    (el): el is HTMLElement => el instanceof HTMLElement,
  )
}

async function mountMenu() {
  const wrapper = await mountWithVuetify(NavUserProfileMenu, {
    props: { session },
    routes: [
      { path: '/', name: 'home', component: stub },
      { path: '/sites', name: 'sites', component: stub },
      { path: '/settings', name: 'settings', component: stub },
      { path: '/docs', name: 'docs', component: stub },
    ],
  })
  await settle()
  return wrapper
}

async function openMenu(wrapper: Awaited<ReturnType<typeof mountMenu>>) {
  const trigger = wrapper.find('button[aria-label^="Account menu"]')
  expect(trigger.exists()).toBe(true)
  await trigger.trigger('click')
  await settle()
  return trigger
}

describe('NavUserProfileMenu', () => {
  beforeEach(() => {
    getAppConfig.mockReset()
  })

  it('names the trigger with the visible initials (WCAG 2.5.3 label in name)', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: false })
    const wrapper = await mountMenu()
    expect(wrapper.get('button.navbar-avatar-trigger').attributes('aria-label')).toBe('Account menu, CU')
    expect(wrapper.get('button.navbar-avatar-trigger').text()).toBe('CU')
  })

  it('opens from a named trigger, routes documentation to the bundled CE docs and emits logout', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: true })
    const wrapper = await mountMenu()
    await openMenu(wrapper)

    const items = menuItems()
    const docs = items.find(item => item.textContent?.includes('Documentation'))
    expect(docs).toBeDefined()
    docs!.click()
    await settle()
    expect(wrapper.router.currentRoute.value.path).toBe('/docs')

    const logout = menuItems().find(item => item.textContent?.includes('Log out'))
    expect(logout).toBeDefined()
    logout!.click()
    await settle()
    expect(wrapper.emitted('logout')?.length).toBeGreaterThanOrEqual(1)
  })

  it('hides documentation when docs are disabled', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: false })
    const wrapper = await mountMenu()
    await openMenu(wrapper)

    const titles = menuItems().map(item => item.textContent?.trim() ?? '')
    expect(titles.some(title => title.includes('Documentation'))).toBe(false)
    expect(titles.some(title => title.includes('Settings'))).toBe(true)
  })

  it('shows the account email at readable emphasis and is accessible', async () => {
    getAppConfig.mockResolvedValue({ docsEnabled: false })
    const wrapper = await mountMenu()
    await openMenu(wrapper)

    const subtitle = document.body.querySelector('.nav-profile-menu__subtitle')
    expect(subtitle).not.toBeNull()
    expect(subtitle!.textContent).toContain('ce@example.test')
    expect(subtitle!.classList.contains('font-weight-light')).toBe(false)
    await expectNoA11yViolations(wrapper)
  })
})
