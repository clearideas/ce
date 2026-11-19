import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, openSelect, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — the Users page (UsersView, User.vue in account mode, UserGroups,
 * UserGroupDialog, AddUserToGroup, UserItemMenu) through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const rows = () => queryAll('.users-body tbody tr').filter(row => row.querySelector('.content-item'))
const names = () => rows().map(row => row.querySelector('.title span')?.textContent?.trim())
const rowFor = (name: string) => rows().find(row => row.textContent?.includes(name))!
const dialogButton = (text: string) => byText<HTMLButtonElement>('[role="dialog"] button', text)

function typeInto(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}

async function openUsers() {
  const app = await mountApp('/users')
  await waitFor(() => expect(names().length).toBe(3))
  return app
}

async function openGroupsTab(wrapper: Awaited<ReturnType<typeof openUsers>>['wrapper']) {
  await wrapper
    .findAll('[role="tab"]')
    .find(tab => tab.text() === 'Groups')!
    .trigger('click')
  await waitFor(() => expect(document.body.textContent).toContain('Engineering'))
}

describe('Users → All users', () => {
  it('lists every user across my sites, loaded once', async () => {
    const { wrapper } = await openUsers()
    expect(names()).toEqual(['Ada Lovelace', 'Alan Turing', 'Grace Hopper'])
    expect(document.title).toBe('Users · Clear Ideas CE')
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['All users', 'Groups'])
    expect(backend.calls('GET', '/api/users')).toHaveLength(1)
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('expands a row to show the user’s site memberships', async () => {
    await openUsers()
    rowFor('Grace Hopper').click()
    await waitFor(() => {
      const expanded = document.body.querySelector('.expanded-row')
      expect(expanded?.textContent).toContain('Product Handbook')
      expect(expanded?.textContent).toContain('Partner Data Room')
    })
  })

  it('removes a user from all sites after confirmation; I cannot remove myself', async () => {
    const { wrapper } = await openUsers()
    expect(wrapper.find('button[aria-label="More actions for Ada Lovelace"]').exists()).toBe(false)

    await wrapper.get('button[aria-label="More actions for Alan Turing"]').trigger('click')
    await settle()
    byText('.v-list-item', 'Remove from all sites')!.click()
    await settle()
    expect(backend.calls('DELETE', `/api/user/${ID.alan}`)).toHaveLength(0)
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Remove Alan Turing from all of your sites?',
    )
    dialogButton('Remove')!.click()
    await waitFor(() => expect(backend.calls('DELETE', `/api/user/${ID.alan}`)).toHaveLength(1))
    await waitFor(() => expect(names()).toEqual(['Ada Lovelace', 'Grace Hopper']))
  })

  it('adds a user to the selected sites', async () => {
    const { wrapper } = await openUsers()
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Add user')!
      .trigger('click')
    const email = await waitFor(() => {
      const el = document.body.querySelector<HTMLInputElement>('[role="dialog"] input[type="email"]')
      expect(el).not.toBeNull()
      return el!
    })
    typeInto(email, 'katherine@example.test')
    await settle()
    await expectNoBlockingA11yViolations(document.querySelector('[role="dialog"]')!)
    // Site picker: a menu of the sites I own or administer.
    const sitesField = queryAll('[role="dialog"] .v-select').find(el => el.textContent?.includes('Sites'))!
    await openSelect(sitesField)
    byText('.v-overlay-container .v-list-item', /Engineering Wiki/)!.click()
    await settle()
    dialogButton('Add user')!.click()
    await waitFor(() => expect(backend.calls('POST', `/api/site/${ID.wiki}/users`)).toHaveLength(1))
    expect(backend.calls('POST', `/api/site/${ID.wiki}/users`)[0].body).toMatchObject({
      email: 'katherine@example.test',
      siteRole: 'viewer',
    })
  })
})

describe('Users → Groups', () => {
  it('lists groups with their member count', async () => {
    const { wrapper } = await openUsers()
    await openGroupsTab(wrapper)
    expect(document.body.textContent).toContain('1 members')
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('creates a group', async () => {
    const { wrapper } = await openUsers()
    await openGroupsTab(wrapper)
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'New group')!
      .trigger('click')
    const input = await waitFor(() => {
      const el = document.body.querySelector<HTMLInputElement>('[role="dialog"] input')
      expect(el).not.toBeNull()
      return el!
    })
    typeInto(input, '  Legal  ')
    await settle()
    dialogButton('Create group')!.click()
    await waitFor(() => expect(backend.calls('POST', '/api/user-groups')).toHaveLength(1))
    expect(backend.calls('POST', '/api/user-groups')[0].body).toEqual({ name: 'Legal' })
    await waitFor(() => expect(document.body.textContent).toContain('Legal'))
  })

  it('adds users to a group from the row, choosing with labelled checkboxes', async () => {
    const { wrapper } = await openUsers()
    await openGroupsTab(wrapper)
    await wrapper.get('button[aria-label="Add users to Engineering"]').trigger('click')
    const alan = await waitFor(() => {
      const el = queryAll('[role="dialog"] .icon-checkbox').find(c => c.textContent?.includes('Alan Turing'))
      expect(el).toBeDefined()
      return el!
    })
    // Grace is already a member, so she is not offered.
    expect(
      queryAll('[role="dialog"] .icon-checkbox').some(c => c.textContent?.includes('Grace Hopper')),
    ).toBe(false)
    expect(dialogButton('Add users')!.disabled).toBe(true)
    alan.querySelector<HTMLInputElement>('input')!.click()
    await settle()
    dialogButton('Add users')!.click()
    await waitFor(() =>
      expect(backend.calls('PATCH', `/api/users/group/${ID.groupEng}/users`)).toHaveLength(1),
    )
    expect(backend.calls('PATCH', `/api/users/group/${ID.groupEng}/users`)[0].body).toEqual({
      users: [ID.alan],
    })
    await expectNoBlockingA11yViolations(document.body)
  })

  it('offers no rename (the API has none): the row has no edit control', async () => {
    const { wrapper } = await openUsers()
    await openGroupsTab(wrapper)
    expect(wrapper.find('[aria-label="Edit user group"]').exists()).toBe(false)
  })

  it('shows a retryable error instead of "No user groups" when groups cannot be loaded', async () => {
    backend.failNext('GET', '/api/user-groups', 503, { error: 'Try again later' })
    const { wrapper } = await openUsers()
    await wrapper
      .findAll('[role="tab"]')
      .find(tab => tab.text() === 'Groups')!
      .trigger('click')
    await waitFor(() =>
      expect(document.body.querySelector('.load-error')?.textContent).toContain('Try again later'),
    )
    expect(document.body.textContent).not.toContain('No user groups')
    byText<HTMLButtonElement>('.load-error button', 'Retry')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Engineering'))
  })
})
