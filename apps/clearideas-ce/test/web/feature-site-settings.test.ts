import { beforeEach, describe, expect, it, vi } from 'vitest'
import { byText, mountApp, openSelect, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — a site's Settings tab (sites/Settings.vue + General, SiteIcon/IconSelect,
 * Notifications, PDFOptions, AI) and the unsaved-changes guard (plan 3.7: "edit site name →
 * navigate away → prompt"), through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const input = (label: string) =>
  document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
const button = (text: string) => byText<HTMLButtonElement>('.site-settings button', text)
const dialogButton = (text: string) => byText<HTMLButtonElement>('[role="dialog"] button', text)
const menuItem = (text: string) =>
  byText('[role="navigation"][aria-label="Site settings sections"] .v-list-item', text)!

function typeInto(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}

async function openSettings(section = '') {
  const app = await mountApp(`/site/${ID.handbook}/settings${section ? `/${section}` : ''}`)
  await waitFor(() => expect(document.body.querySelector('.site-settings .settings-card')).not.toBeNull())
  return app
}

async function expectUnsavedPrompt() {
  await waitFor(() =>
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Unsaved changes'),
  )
}

describe('Site settings → General', () => {
  it('shows name, id and visibility, and saves a rename', async () => {
    const { wrapper, router } = await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    expect(input('Site ID').value).toBe(ID.handbook)
    expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/settings`)
    expect(button('Save')!.disabled).toBe(true)

    typeInto(input('Site name'), 'Product Handbook v2')
    await settle()
    button('Save')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toEqual({
      name: 'Product Handbook v2',
      visibility: 'private',
    })
    await waitFor(() => expect(wrapper.find('h1').text()).toBe('Product Handbook v2'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('switches visibility to public', async () => {
    await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    button('Public')!.click()
    await settle()
    expect(document.body.textContent).toContain('This site is publicly visible.')
    button('Save')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toMatchObject({
      visibility: 'public',
    })
  })

  it('copies the site id', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    await openSettings()
    await waitFor(() => expect(input('Site ID').value).toBe(ID.handbook))
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Copy site ID"]')!.click()
    await settle()
    expect(writeText).toHaveBeenCalledWith(ID.handbook)
    expect(document.body.querySelector('button[aria-label="Site ID copied"]')).not.toBeNull()
  })

  it('asks before leaving the settings tab with an unsaved rename, and stays on "Keep editing"', async () => {
    const { wrapper, router } = await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    typeInto(input('Site name'), 'Renamed but not saved')
    await settle()

    await wrapper
      .findAll('[role="tab"]')
      .find(tab => tab.text() === 'Content')!
      .trigger('click')
    await expectUnsavedPrompt()
    dialogButton('Keep editing')!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/settings`)
    expect(input('Site name').value).toBe('Renamed but not saved')
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Settings')
  })

  it('"Leave without saving" goes to the content tab and discards the edit', async () => {
    const { wrapper, router } = await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    typeInto(input('Site name'), 'Renamed but not saved')
    await settle()

    await wrapper
      .findAll('[role="tab"]')
      .find(tab => tab.text() === 'Content')!
      .trigger('click')
    await expectUnsavedPrompt()
    dialogButton('Leave without saving')!.click()
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/content`))
    await waitFor(() => expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Content'))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(0)
  })

  it('asks before switching to another settings section with unsaved changes', async () => {
    const { router } = await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    typeInto(input('Site name'), 'Renamed but not saved')
    await settle()

    menuItem('AI').click()
    await expectUnsavedPrompt()
    dialogButton('Keep editing')!.click()
    await settle()
    expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/settings`)
    expect(input('Site name').value).toBe('Renamed but not saved')
  })

  it('switches sections freely when nothing is dirty', async () => {
    const { router } = await openSettings()
    await waitFor(() => expect(input('Site name').value).toBe('Product Handbook'))
    menuItem('PDF options').click()
    await waitFor(() =>
      expect(router.currentRoute.value.path).toBe(`/site/${ID.handbook}/settings/pdf-options`),
    )
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('Site settings → other sections', () => {
  it('AI: enabling MCP keeps the existing AI attributes', async () => {
    const { wrapper } = await openSettings('ai')
    const mcp = await waitFor(() => {
      const el = queryAll('.icon-checkbox').find(c => c.textContent?.includes('Enable MCP access'))
      expect(el).toBeDefined()
      return el!.querySelector<HTMLInputElement>('input')!
    })
    mcp.click()
    await settle()
    button('Save')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toEqual({
      attributes: { ai: { chatEnabled: true, mcpEnabled: true } },
    })
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('AI: disabling chat removes the AI tab', async () => {
    const { wrapper } = await openSettings('ai')
    const chat = await waitFor(() => {
      const el = queryAll('.icon-checkbox').find(c => c.textContent?.includes('Enable AI chat'))
      expect(el).toBeDefined()
      return el!.querySelector<HTMLInputElement>('input')!
    })
    expect(wrapper.findAll('[role="tab"]').map(t => t.text())).toContain('AI')
    chat.click()
    await settle()
    button('Save')!.click()
    await waitFor(() => expect(wrapper.findAll('[role="tab"]').map(t => t.text())).not.toContain('AI'))
  })

  it('Notifications: toggles site notifications', async () => {
    await openSettings('notifications')
    const toggle = await waitFor(() => {
      const el = queryAll('.icon-checkbox').find(c => c.textContent?.includes('Enable notifications'))
      expect(el).toBeDefined()
      return el!.querySelector<HTMLInputElement>('input')!
    })
    expect(toggle.checked).toBe(true)
    toggle.click()
    await settle()
    button('Save')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toEqual({
      attributes: { notifications: false },
    })
  })

  it('PDF options: enables printing for chosen roles', async () => {
    await openSettings('pdf-options')
    const toggle = await waitFor(() => {
      const el = queryAll('.icon-checkbox').find(c => c.textContent?.includes('Enable printing'))
      expect(el).toBeDefined()
      return el!.querySelector<HTMLInputElement>('input')!
    })
    toggle.click()
    await settle()
    await expectNoBlockingA11yViolations(document.querySelector('.site-settings')!)
    const roles = queryAll('.site-settings .v-select').find(el => el.textContent?.includes('Roles'))!
    await openSelect(roles)
    byText('.v-overlay-container .v-list-item', /Editor/)!.click()
    await settle()
    button('Save')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toEqual({
      attributes: { pdf: { printEnabled: true, printRoles: ['editor'] } },
    })
  })

  it('Icons and branding: picks a named icon and saves it', async () => {
    const { wrapper } = await openSettings('branding')
    const current = await waitFor(() => {
      const el = document.body.querySelector<HTMLButtonElement>('button[aria-label="Book"]')
      expect(el).not.toBeNull()
      return el!
    })
    expect(current.getAttribute('aria-pressed')).toBe('true')
    document.body.querySelector<HTMLButtonElement>('button[aria-label="Briefcase"]')!.click()
    await settle()
    button('Save icon')!.click()
    await waitFor(() => expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)).toHaveLength(1))
    expect(backend.calls('PATCH', `/api/sites/${ID.handbook}`)[0].body).toEqual({ icon: 'fa-briefcase' })
    await expectNoBlockingA11yViolations(wrapper)
  })
})
