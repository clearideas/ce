import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, openSelect, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — a site's Users tab (User.vue in site mode, UserActions, UserDialog, UserItemMenu,
 * role selector) through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const userRows = () =>
  queryAll('.data-table-wrapper tbody tr').filter(row => row.querySelector('.content-item'))
const rowFor = (name: string) => userRows().find(row => row.textContent?.includes(name))!
const names = () => userRows().map(row => row.querySelector('.title span')?.textContent?.trim())

async function openUsersTab(siteId: string = ID.handbook) {
  const app = await mountApp(`/site/${siteId}/users`)
  await waitFor(() => expect(names().length).toBeGreaterThan(0))
  return app
}

describe('Site users', () => {
  it('lists the members alphabetically with their role, "You" and invitation status', async () => {
    const { wrapper } = await openUsersTab()
    expect(names()).toEqual(['Ada Lovelace', 'Alan Turing', 'Grace Hopper'])
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Users')
    expect(rowFor('Ada Lovelace').textContent).toContain('You')
    expect(rowFor('Ada Lovelace').textContent).toContain('Owner')
    expect(rowFor('Grace Hopper').textContent).toContain('Editor')
    expect(rowFor('Alan Turing').textContent).toContain('invited')
    expect(rowFor('Alan Turing').textContent).toContain('Viewer')
    expect(backend.unhandled).toEqual([])
  })

  it('has no structural accessibility violations (role selectors are labelled)', async () => {
    const { wrapper } = await openUsersTab()
    expect(wrapper.find(`[aria-label="Role for Grace Hopper"]`).exists()).toBe(true)
    await expectNoA11yViolations(wrapper)
  })

  it('changes a member’s role', async () => {
    await openUsersTab()
    await openSelect(rowFor('Grace Hopper').querySelector('.v-select')!)
    byText('.v-overlay-container .v-list-item, .v-overlay-container .data-table-item', /^Admin/)!.click()
    await waitFor(() =>
      expect(backend.calls('PUT', `/api/site/${ID.handbook}/user/${ID.grace}`)).toHaveLength(1),
    )
    expect(backend.calls('PUT', `/api/site/${ID.handbook}/user/${ID.grace}`)[0].body).toEqual({
      role: 'admin',
    })
    await waitFor(() => expect(rowFor('Grace Hopper').textContent).toContain('Admin'))
  })

  it('the owner’s role is read-only', async () => {
    await openUsersTab()
    expect(rowFor('Ada Lovelace').querySelector('.v-select')).toBeNull()
    expect(rowFor('Ada Lovelace').querySelector('.user-role-selector--readonly')).not.toBeNull()
  })

  it('adds a user to the site with the chosen details', async () => {
    const { wrapper } = await openUsersTab()
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Add user')!
      .trigger('click')
    const inputs = await waitFor(() => {
      const found = queryAll('[role="dialog"] input')
      expect(found.length).toBeGreaterThanOrEqual(2)
      return found as HTMLInputElement[]
    })
    inputs[0].value = 'katherine@example.test'
    inputs[0].dispatchEvent(new Event('input'))
    inputs[1].value = 'Katherine Johnson'
    inputs[1].dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('[role="dialog"] button', 'Add user')!.click()

    await waitFor(() => expect(backend.calls('POST', `/api/site/${ID.handbook}/users`)).toHaveLength(1))
    expect(backend.calls('POST', `/api/site/${ID.handbook}/users`)[0].body).toEqual({
      email: 'katherine@example.test',
      displayName: 'Katherine Johnson',
      siteRole: 'viewer',
    })
    await waitFor(() => expect(names()).toContain('Katherine Johnson'))
  })

  it('rejects an invalid email without calling the API', async () => {
    const { wrapper } = await openUsersTab()
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Add user')!
      .trigger('click')
    const input = await waitFor(() => document.body.querySelector<HTMLInputElement>('[role="dialog"] input')!)
    input.value = 'not-an-email'
    input.dispatchEvent(new Event('input'))
    await settle()
    byText<HTMLButtonElement>('[role="dialog"] button', 'Add user')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Valid email is required'))
    expect(backend.calls('POST', `/api/site/${ID.handbook}/users`)).toHaveLength(0)
  })

  it('removes a member only after confirmation', async () => {
    const { wrapper } = await openUsersTab()
    await wrapper.get('button[aria-label="More actions for Grace Hopper"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Remove from site')!.click()
    await settle()
    expect(backend.calls('DELETE', `/api/site/${ID.handbook}/user/${ID.grace}`)).toHaveLength(0)
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Remove Grace Hopper from this site?')

    byText<HTMLButtonElement>('[role="dialog"] button', 'Remove')!.click()
    await waitFor(() =>
      expect(backend.calls('DELETE', `/api/site/${ID.handbook}/user/${ID.grace}`)).toHaveLength(1),
    )
    await waitFor(() => expect(names()).not.toContain('Grace Hopper'))
  })

  it('cancelling the removal keeps the member', async () => {
    const { wrapper } = await openUsersTab()
    await wrapper.get('button[aria-label="More actions for Alan Turing"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Remove from site')!.click()
    await settle()
    byText<HTMLButtonElement>('[role="dialog"] button', 'Cancel')!.click()
    await settle()
    expect(backend.calls('DELETE', /\/user\//)).toHaveLength(0)
    expect(names()).toContain('Alan Turing')
  })

  it('resends an invitation', async () => {
    const { wrapper } = await openUsersTab()
    await wrapper.get('button[aria-label="More actions for Alan Turing"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Resend invite')!.click()
    await waitFor(() =>
      expect(backend.calls('PATCH', `/api/site/${ID.handbook}/user/${ID.alan}/resend`)).toHaveLength(1),
    )
  })
})
