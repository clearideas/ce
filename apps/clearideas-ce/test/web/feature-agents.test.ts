import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, openSelect, queryAll, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — Agents (AgentsView, ManifestEditor, agent store incl. NDJSON run streaming)
 * through the real app against the fake backend.
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
})

const button = (text: string) => byText<HTMLButtonElement>('.agents-view button', text)
const dialogButton = (text: string) => byText<HTMLButtonElement>('[role="dialog"] button', text)

async function openAgents() {
  const app = await mountApp('/agents')
  await waitFor(() => expect(backend.calls('GET', '/api/agents')).toHaveLength(1))
  await waitFor(() => expect(button('Save')).toBeDefined())
  return app
}

async function createStarterAgent() {
  button('Save')!.click()
  await waitFor(() => expect(backend.calls('POST', '/api/agents')).toHaveLength(1))
  await waitFor(() => expect(button('Run agent')).toBeDefined())
}

async function chooseSite(name: string) {
  const select = queryAll('.agents-view .v-select').find(el => el.textContent?.includes('Site'))!
  await openSelect(select)
  byText('.v-overlay-container .v-list-item', name)!.click()
  await settle()
}

describe('Agents', () => {
  it('starts with the starter manifest and creates an agent from it', async () => {
    const { wrapper } = await openAgents()
    expect(document.body.textContent).toContain('No agents yet')
    expect(document.title).toBe('Agents · Clear Ideas CE')
    // Configured server: no warning (and none flashed while the list was loading).
    expect(document.body.textContent).not.toContain('Agents are not configured')
    await createStarterAgent()
    expect(backend.calls('POST', '/api/agents')[0].body).toMatchObject({
      manifest: { name: 'Site research assistant', schemaVersion: '1.0' },
    })
    await waitFor(() => expect(document.body.textContent).toContain('Site research assistant'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('runs an agent against the chosen site and shows the streamed output and history', async () => {
    await openAgents()
    await createStarterAgent()
    // The starter uses Site tools, so a Site must be chosen first.
    expect(document.body.textContent).toContain('Select a Site to run this agent.')
    expect(button('Run agent')!.disabled).toBe(true)
    await chooseSite('Product Handbook')
    expect(button('Run agent')!.disabled).toBe(false)

    button('Run agent')!.click()
    await waitFor(() =>
      expect(document.body.textContent).toContain('The handbook covers leave and travel policies.'),
    )
    const runCall = backend.calls('POST', /\/api\/agents\/[0-9a-f]+\/runs$/)[0]
    expect(runCall.body).toMatchObject({ siteId: ID.handbook })
    await waitFor(() => expect(queryAll('.run-history__row')).toHaveLength(1))

    byText<HTMLButtonElement>('.run-history__row button', 'View')!.click()
    await waitFor(() =>
      expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Run details'),
    )
    await waitFor(() =>
      expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
        'The handbook covers leave',
      ),
    )
  })

  it('a failed run shows the error and can be resumed', async () => {
    await openAgents()
    await createStarterAgent()
    await chooseSite('Product Handbook')
    backend.agents.nextError = 'Model quota exceeded'
    button('Run agent')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Model quota exceeded'))
    await waitFor(() => expect(byText('.run-history__row button', 'Resume')).toBeDefined())
    byText<HTMLButtonElement>('.run-history__row button', 'Resume')!.click()
    await waitFor(() => expect(backend.calls('POST', /\/resume$/)).toHaveLength(1))
  })

  it('warns and disables Run when the agent runtime is not configured', async () => {
    backend.agents.runtimeConfigured = false
    await openAgents()
    await createStarterAgent()
    expect(document.body.textContent).toContain('Agents are not configured on the server')
    expect(document.body.textContent).toContain('AI_AGENT_MODEL')
    await chooseSite('Product Handbook')
    expect(button('Run agent')!.disabled).toBe(true)
  })

  it('creates, toggles and (after confirmation) deletes a schedule', async () => {
    const { wrapper } = await openAgents()
    await createStarterAgent()
    await chooseSite('Product Handbook')
    button('Create schedule')!.click()
    await waitFor(() => expect(backend.calls('POST', /\/schedules$/)).toHaveLength(1))
    expect(backend.calls('POST', /\/schedules$/)[0].body).toMatchObject({
      // The profile's saved time zone (Europe/London), not the browser's (UTC here).
      definition: { kind: 'daily', time: '09:00', timeZone: 'Europe/London' },
      siteId: ID.handbook,
      enabled: true,
    })
    const toggle = await waitFor(() => {
      const el = document.body.querySelector<HTMLInputElement>('input[aria-label="Enable daily schedule"]')
      expect(el).not.toBeNull()
      return el!
    })
    toggle.click()
    await waitFor(() => expect(backend.calls('PATCH', /\/api\/agent-schedules\//)).toHaveLength(1))
    expect(backend.calls('PATCH', /\/api\/agent-schedules\//)[0].body).toMatchObject({ enabled: false })

    await wrapper.get('button[aria-label="Delete daily schedule"]').trigger('click')
    await settle()
    expect(backend.calls('DELETE', /\/api\/agent-schedules\//)).toHaveLength(0)
    dialogButton('Delete')!.click()
    await waitFor(() => expect(backend.calls('DELETE', /\/api\/agent-schedules\//)).toHaveLength(1))
    await waitFor(() => expect(document.body.textContent).toContain('No schedules'))
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('a one-off schedule without a date explains what is missing', async () => {
    await openAgents()
    await createStarterAgent()
    await chooseSite('Product Handbook')
    const frequency = queryAll('.agents-view .v-select').find(el => el.textContent?.includes('Frequency'))!
    await openSelect(frequency)
    byText('.v-overlay-container .v-list-item', 'once')!.click()
    await settle()
    button('Create schedule')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Choose a date and time.'))
    expect(backend.calls('POST', /\/schedules$/)).toHaveLength(0)
  })

  it('deletes an agent after confirmation', async () => {
    await openAgents()
    await createStarterAgent()
    button('Delete')!.click()
    await settle()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
      'Delete “Site research assistant”?',
    )
    dialogButton('Delete')!.click()
    await waitFor(() => expect(backend.calls('DELETE', /\/api\/agents\//)).toHaveLength(1))
    await waitFor(() => expect(document.body.textContent).toContain('No agents yet'))
  })

  it('shows a retryable error when agents cannot be loaded', async () => {
    backend.failNext('GET', '/api/agents', 500, { error: 'Agent service unavailable' })
    await mountApp('/agents')
    await waitFor(() =>
      expect(document.body.querySelector('.load-error')?.textContent).toContain('Agent service unavailable'),
    )
    byText<HTMLButtonElement>('.load-error button', 'Retry')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('No agents yet'))
  })
})
