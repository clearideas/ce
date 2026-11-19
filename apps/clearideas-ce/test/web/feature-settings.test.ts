import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — Settings (SettingsView + ProfileSettings, TimeZone, SiteInvitations,
 * SuppressedSites, NotificationSettings/Schedule, ActiveSessions, AccessKeys/NewAccessKey) and the
 * unsaved-changes guard (plan 3.7), through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

function typeInto(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input'))
}

const field = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
const button = (text: string) => byText<HTMLButtonElement>('button', text)
const dialogButton = (text: string) => byText<HTMLButtonElement>('[role="dialog"] button', text)

async function openSettings(section = '') {
  const app = await mountApp(`/settings${section ? `/${section}` : ''}`)
  await waitFor(() => expect(document.body.querySelector('.settings-card')).not.toBeNull())
  return app
}

describe('Settings → Profile', () => {
  it('renders the profile section with the page heading and title', async () => {
    const { wrapper } = await openSettings()
    await waitFor(() => expect(field('Display name').value).toBe('Ada Lovelace'))
    expect(field('Account name').value).toBe("Ada's Workspace")
    expect(wrapper.find('h1').text()).toBe('Settings: Profile')
    expect(document.title).toBe('Settings · Clear Ideas CE')
    expect(button('Save profile')!.disabled).toBe(true)
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('saves the display name and account name', async () => {
    await openSettings()
    await waitFor(() => expect(field('Display name').value).toBe('Ada Lovelace'))
    typeInto(field('Display name'), '  Ada King  ')
    typeInto(field('Account name'), 'Analytical Engines')
    await settle()
    expect(document.body.textContent).toContain('Unsaved changes')
    button('Save profile')!.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/account')).toHaveLength(1))
    expect(backend.calls('PATCH', '/api/profile')[0].body).toEqual({ displayName: 'Ada King' })
    expect(backend.calls('PATCH', '/api/account')[0].body).toEqual({ name: 'Analytical Engines' })
    await waitFor(() => expect(button('Save profile')!.disabled).toBe(true))
  })

  it('asks before leaving the page with unsaved changes ("Keep editing" stays)', async () => {
    const { router } = await openSettings()
    await waitFor(() => expect(field('Display name').value).toBe('Ada Lovelace'))
    typeInto(field('Display name'), 'Changed')
    await settle()

    void router.push('/sites')
    await waitFor(() =>
      expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Unsaved changes'),
    )
    dialogButton('Keep editing')!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(field('Display name').value).toBe('Changed')
  })

  it('"Leave without saving" navigates away', async () => {
    const { router } = await openSettings()
    await waitFor(() => expect(field('Display name').value).toBe('Ada Lovelace'))
    typeInto(field('Display name'), 'Changed')
    await settle()
    void router.push('/sites')
    await waitFor(() => expect(dialogButton('Leave without saving')).toBeDefined())
    dialogButton('Leave without saving')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/sites'))
    expect(backend.calls('PATCH', '/api/profile')).toHaveLength(0)
  })

  it('asks before switching to another settings section with unsaved changes', async () => {
    const { router } = await openSettings()
    await waitFor(() => expect(field('Display name').value).toBe('Ada Lovelace'))
    typeInto(field('Display name'), 'Changed')
    await settle()

    byText('[role="navigation"][aria-label="Settings sections"] .v-list-item', 'Notifications')!.click()
    await waitFor(() =>
      expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Unsaved changes'),
    )
    dialogButton('Keep editing')!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(field('Display name').value).toBe('Changed')
  })

  it('updates the time zone', async () => {
    await openSettings()
    await waitFor(() => expect(document.body.textContent).toContain('Europe/London'))
    button('Update time zone')!.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
    const body = backend.calls('PATCH', '/api/profile')[0].body as { attributes: { timeZone: string } }
    expect(body.attributes.timeZone).toBe('Europe/London')
  })
})

describe('Settings → Notifications', () => {
  it('opens clean: no "Unsaved changes" until something is edited (daily schedule with stale days)', async () => {
    await openSettings('notifications')
    await waitFor(() => expect(queryAll('input[type="checkbox"]').length).toBeGreaterThan(3))
    await settle()
    expect(document.body.textContent).not.toContain('Unsaved changes')
    expect(button('Save notification settings')!.disabled).toBe(true)
  })

  it('saves the schedule and unsubscribed sites without losing favourites', async () => {
    const { wrapper } = await openSettings('notifications')
    await waitFor(() => expect(queryAll('input[type="checkbox"]').length).toBeGreaterThan(3))
    const wiki = queryAll('.icon-checkbox').find(el => el.textContent?.trim() === 'Engineering Wiki')!
    wiki.querySelector<HTMLInputElement>('input')!.click()
    await settle()
    button('Save notification settings')!.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
    const body = backend.calls('PATCH', '/api/profile')[0].body as {
      attributes: { sites: Record<string, unknown>; notifications: { frequency: string } }
    }
    expect(body.attributes.sites.suppressNotifications).toEqual([ID.wiki])
    expect(body.attributes.sites.favourites).toEqual([ID.handbook])
    expect(body.attributes.notifications.frequency).toBe('daily')
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('an unsaved time change is not kept after leaving without saving', async () => {
    const { router } = await openSettings('notifications')
    const timeInput = () => {
      const el = document.body.querySelector<HTMLInputElement>('input[type="time"]')
      expect(el).not.toBeNull()
      return el!
    }
    const start = await waitFor(timeInput)
    expect(start.value).toBe('09:00')
    typeInto(start, '07:30')
    await settle()

    void router.push('/sites')
    await waitFor(() => expect(dialogButton('Leave without saving')).toBeDefined())
    dialogButton('Leave without saving')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/sites'))

    await router.push('/settings/notifications')
    const again = await waitFor(timeInput)
    expect(again.value).toBe('09:00')
  })
})

describe('Settings → Sites', () => {
  it('toggles automatic acceptance of invitations', async () => {
    await openSettings('sites')
    const toggle = await waitFor(() => {
      const el = queryAll('.icon-checkbox').find(c => c.textContent?.includes('Automatically accept'))
      expect(el).toBeDefined()
      return el!.querySelector<HTMLInputElement>('input')!
    })
    toggle.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
    const body = backend.calls('PATCH', '/api/profile')[0].body as {
      attributes: { sites: Record<string, unknown> }
    }
    expect(body.attributes.sites.autoAcceptInvites).toBe(true)
    expect(body.attributes.sites.favourites).toEqual([ID.handbook])
  })

  it('lists blocked sites and unblocks one', async () => {
    backend.state.suppressedSites = [backend.state.sites[2]]
    backend.state.profile.attributes!.sites!.suppressedSites = [ID.partner]
    await openSettings('sites')
    await waitFor(() => expect(document.body.textContent).toContain('Blocked site'))
    button('Unblock')!.click()
    await waitFor(() => expect(backend.calls('PATCH', '/api/profile')).toHaveLength(1))
    const body = backend.calls('PATCH', '/api/profile')[0].body as {
      attributes: { sites: Record<string, unknown> }
    }
    expect(body.attributes.sites.suppressedSites).toEqual([])
  })
})

describe('Settings → Security', () => {
  it('lists sessions through the real client and revokes another session by token', async () => {
    const { wrapper } = await openSettings('sessions')
    await waitFor(() => expect(document.body.textContent).toContain('Safari on iOS'))
    expect(wrapper.get('[data-testid="current-session"]').text()).toContain('Chrome on Windows')
    wrapper
      .get('button[aria-label="Sign out session on Safari on iOS"]')
      .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()
    dialogButton('Sign out')!.click()
    await waitFor(() => expect(backend.calls('POST', '/api/auth/revoke-session')).toHaveLength(1))
    expect(backend.calls('POST', '/api/auth/revoke-session')[0].body).toEqual({ token: 'tok-phone' })
    await waitFor(() => expect(document.body.textContent).toContain('You are not signed in anywhere else.'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('creates an access key, shows the secret once, and revokes a key after confirmation', async () => {
    const { wrapper } = await openSettings('access-keys')
    await waitFor(() => expect(document.body.textContent).toContain('Claude Desktop'))

    const create = wrapper
      .findAll('button')
      .find(b => /New access key|Create access key|New key/i.test(b.text()))!
    await create.trigger('click')
    const nameInput = await waitFor(() =>
      document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!,
    )
    typeInto(nameInput, 'CI pipeline')
    await settle()
    const readScope = queryAll('[role="dialog"] .icon-checkbox').find(el =>
      el.textContent?.includes('Read MCP context'),
    )!
    readScope.querySelector<HTMLInputElement>('input')!.click()
    await settle()
    const confirm = queryAll('[role="dialog"] button').find(b =>
      /Create/.test(b.textContent ?? ''),
    ) as HTMLButtonElement
    confirm.click()
    await waitFor(() => expect(backend.calls('POST', '/api/account/access-keys')).toHaveLength(1))
    expect(backend.calls('POST', '/api/account/access-keys')[0].body).toMatchObject({
      name: 'CI pipeline',
      keyType: 'mcp',
      scopes: ['mcp:read'],
    })
    await waitFor(() => expect(document.body.textContent).toContain('ci_live_secret_value'))

    wrapper
      .get('button[aria-label="Revoke access key Claude Desktop"]')
      .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await settle()
    expect(backend.calls('DELETE', /access-keys/)).toHaveLength(0)
    dialogButton('Revoke')!.click()
    await waitFor(() => expect(backend.calls('DELETE', '/api/account/access-keys/key-1')).toHaveLength(1))
  })
})
