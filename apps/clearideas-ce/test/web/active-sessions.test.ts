import { createTestingPinia } from '@pinia/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ActiveSessions from '../../src-web/src/components/settings/ActiveSessions.vue'
import { useAuthStore } from '../../src-web/src/stores/auth.store'
import type { AuthSession } from '../../src-web/src/types/domain'
import { describeUserAgent } from '../../src-web/src/utils/userAgent'
import { expectNoA11yViolations, mountWithVuetify, settle } from './harness'

/**
 * Plan item 3.8 step 2 — Settings → Active sessions with real data. The server side (Better Auth
 * list/revoke endpoints reachable through the CE API) is covered by test/api/auth-sessions.test.ts;
 * this spec covers the card against a mocked client.
 */
const { listSessions, currentSession, revokeSession, revokeOtherSessions, alertAdd } = vi.hoisted(() => ({
  listSessions: vi.fn(),
  currentSession: vi.fn(),
  revokeSession: vi.fn(),
  revokeOtherSessions: vi.fn(),
  alertAdd: vi.fn(),
}))

vi.mock('../../src-web/src/api/client', () => ({
  ceApi: { listSessions, currentSession, revokeSession, revokeOtherSessions },
}))
vi.mock('../../src-web/src/composables/useAlert', () => ({
  useAlert: () => ({ add: alertAdd }),
  updateAlertTheme: vi.fn(),
}))

const UA = {
  chromeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

function sessionRow(id: string, userAgent: string, updatedHoursAgo: number, ip = '203.0.113.7'): AuthSession {
  return {
    id,
    token: `token-${id}`,
    userId: 'user-1',
    createdAt: hoursAgo(updatedHoursAgo + 24),
    updatedAt: hoursAgo(updatedHoursAgo),
    expiresAt: inDays(6),
    ipAddress: ip,
    userAgent,
  }
}

async function mountCard() {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true })
  const authStore = useAuthStore(pinia)
  authStore.session = { user: { id: 'user-1', email: 'ada@example.test', name: 'Ada' } }
  const wrapper = await mountWithVuetify(ActiveSessions, { global: { plugins: [pinia] } })
  await settle()
  return { wrapper, authStore }
}

function buttonByText(root: ParentNode, text: string) {
  return [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === text) as
    HTMLButtonElement | undefined
}

describe('describeUserAgent', () => {
  it.each([
    [UA.chromeWindows, 'Chrome on Windows', 'desktop'],
    [UA.safariIphone, 'Safari on iOS', 'mobile'],
    [UA.firefoxLinux, 'Firefox on Linux', 'desktop'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
      'Edge on macOS',
      'desktop',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome on Android',
      'tablet',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iPadOS',
      'tablet',
    ],
    ['node-superagent/10.2.3', 'Unknown device', 'desktop'],
    ['', 'Unknown device', 'desktop'],
  ])('%s → %s (%s)', (ua, label, kind) => {
    const device = describeUserAgent(ua)
    expect(device.label).toBe(label)
    expect(device.kind).toBe(kind)
  })
})

describe('ActiveSessions (plan item 3.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listSessions.mockResolvedValue([
      sessionRow('current', UA.chromeWindows, 0, '198.51.100.4'),
      sessionRow('phone', UA.safariIphone, 2),
      sessionRow('laptop', UA.firefoxLinux, 30),
    ])
    currentSession.mockResolvedValue({ session: { id: 'current', token: 'token-current' } })
    revokeSession.mockResolvedValue({ status: true })
    revokeOtherSessions.mockResolvedValue({ status: true })
  })

  it('marks this browser as current and lists the other sessions, most recently active first', async () => {
    const { wrapper } = await mountCard()
    expect(listSessions).toHaveBeenCalledTimes(1)
    expect(currentSession).toHaveBeenCalledTimes(1)

    const current = wrapper.get('[data-testid="current-session"]')
    expect(current.text()).toContain('This browser')
    expect(current.text()).toContain('Current')
    expect(current.text()).toContain('Chrome on Windows')
    expect(current.text()).toContain('198.51.100.4')
    expect(current.text()).toContain('ada@example.test')

    const rows = wrapper.findAll('ul[aria-label="Other sessions"] > li')
    expect(rows.map(row => row.find('.title').text())).toEqual(['Safari on iOS', 'Firefox on Linux'])
    expect(rows[0].text()).toContain('203.0.113.7')
    expect(rows[0].text()).toMatch(/Last active 2 hours ago/)
    // The current session is not offered for revocation and tokens are never rendered.
    expect(wrapper.find('button[aria-label="Sign out session on Chrome on Windows"]').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('token-')
    await expectNoA11yViolations(wrapper)
  })

  it('asks for confirmation, then revokes the chosen session by token', async () => {
    const { wrapper } = await mountCard()
    await wrapper.get('button[aria-label="Sign out session on Safari on iOS"]').trigger('click')
    await settle()
    expect(revokeSession).not.toHaveBeenCalled()

    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Sign out the session on Safari on iOS?')
    buttonByText(dialog, 'Sign out')!.click()
    await settle()

    expect(revokeSession).toHaveBeenCalledWith('token-phone')
    expect(wrapper.findAll('ul[aria-label="Other sessions"] > li')).toHaveLength(1)
    expect(alertAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
  })

  it('cancelling the confirmation revokes nothing', async () => {
    const { wrapper } = await mountCard()
    await wrapper.get('button[aria-label="Sign out session on Firefox on Linux"]').trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]')!
    buttonByText(dialog, 'Cancel')!.click()
    await settle()
    expect(revokeSession).not.toHaveBeenCalled()
    expect(wrapper.findAll('ul[aria-label="Other sessions"] > li')).toHaveLength(2)
  })

  it('signs out everywhere else after confirmation and reloads the list', async () => {
    const { wrapper } = await mountCard()
    listSessions.mockResolvedValue([sessionRow('current', UA.chromeWindows, 0)])
    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Sign out everywhere else')!
      .trigger('click')
    await settle()
    const dialog = document.body.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('Sign out all 2 other sessions?')
    buttonByText(dialog, 'Sign out all')!.click()
    await settle()

    expect(revokeOtherSessions).toHaveBeenCalledTimes(1)
    expect(listSessions).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('You are not signed in anywhere else.')
    expect(wrapper.find('ul[aria-label="Other sessions"]').exists()).toBe(false)
  })

  it('keeps the row and reports the error when a revoke fails', async () => {
    revokeSession.mockRejectedValue(new Error('Session not found'))
    const { wrapper } = await mountCard()
    await wrapper.get('button[aria-label="Sign out session on Safari on iOS"]').trigger('click')
    await settle()
    buttonByText(document.body.querySelector('[role="dialog"]')!, 'Sign out')!.click()
    await settle()
    expect(alertAdd).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'Session not found' }),
    )
    expect(wrapper.findAll('ul[aria-label="Other sessions"] > li')).toHaveLength(2)
  })

  it('shows a retryable error when the sessions cannot be loaded, keeping the current-browser row', async () => {
    listSessions.mockRejectedValueOnce(new Error('Service unavailable'))
    const { wrapper } = await mountCard()
    expect(wrapper.get('[data-testid="current-session"]').text()).toContain('This browser')
    expect(wrapper.text()).toContain('Service unavailable')

    await wrapper
      .findAll('button')
      .find(b => b.text() === 'Retry')!
      .trigger('click')
    await settle()
    expect(wrapper.findAll('ul[aria-label="Other sessions"] > li')).toHaveLength(2)
  })

  it('"Sign out" on this browser logs out and returns to the login page', async () => {
    const { wrapper, authStore } = await mountCard()
    vi.mocked(authStore.logout).mockResolvedValue()
    const push = vi.spyOn(wrapper.router, 'push')
    await wrapper.get('[data-testid="current-session"] button').trigger('click')
    await settle()
    expect(authStore.logout).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/login')
  })
})
