import { beforeEach, describe, expect, it } from 'vitest'
import { byText, mountApp, waitFor } from './fixtures/app'
import { ID, installFakeBackend, type FakeBackend } from './fixtures/backend'
import { expectNoBlockingA11yViolations, settle } from './harness'

/**
 * Plan item 4.2 — LoginView (email → code → redirect) through the real app, auth store and router
 * against the fake backend (valid code: 123456).
 */
let backend: FakeBackend

beforeEach(() => {
  window.localStorage.clear()
  backend = installFakeBackend()
  backend.state.session = null as never
})

const field = (label: string) =>
  [...document.body.querySelectorAll<HTMLInputElement>('input')].find(
    input => document.getElementById(`${input.id}-label`)?.textContent?.trim() === label,
  )
const button = (text: string) => byText<HTMLButtonElement>('button', text)

function typeInto(el: HTMLInputElement, value: string) {
  el.value = value
  el.dispatchEvent(new Event('input'))
}

async function requestCode(email = 'ada@example.test') {
  await waitFor(() => expect(field('Email')).toBeDefined())
  typeInto(field('Email')!, email)
  await settle()
  button('Send code')!.click()
  await waitFor(() => expect(field('Sign-in code')).toBeDefined())
}

describe('Login', () => {
  it('renders the sign-in form with a page title and no blocking a11y issues', async () => {
    const { wrapper } = await mountApp('/login')
    await waitFor(() => expect(wrapper.find('h1').text()).toBe('Sign in with email code'))
    expect(document.title).toBe('Sign in · Clear Ideas CE')
    expect(field('Email')).toBeDefined()
    await expectNoBlockingA11yViolations(wrapper)
  })

  it('sends a code, verifies it and opens the workspace', async () => {
    const { router } = await mountApp('/login')
    await requestCode()
    expect(backend.calls('POST', '/api/auth/code/send')[0].body).toEqual({ email: 'ada@example.test' })
    expect(document.body.textContent).toContain('Check your email for a sign-in code.')
    expect(field('Email')!.readOnly).toBe(true)

    typeInto(field('Sign-in code')!, '123456')
    await settle()
    button('Verify code')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Opening Clear Ideas'))
    expect(backend.calls('POST', '/api/auth/code/verify')[0].body).toMatchObject({
      email: 'ada@example.test',
      code: '123456',
      name: 'ada',
    })
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/sites'), { timeout: 5000 })
  })

  it('keeps only digits in the code field (pasted codes with spaces or dashes)', async () => {
    await mountApp('/login')
    await requestCode()
    typeInto(field('Sign-in code')!, '12-34 56')
    await settle()
    expect(field('Sign-in code')!.value).toBe('123456')
  })

  it('shows the API error for a wrong code and lets the user change the email', async () => {
    await mountApp('/login')
    await requestCode()
    typeInto(field('Sign-in code')!, '000000')
    await settle()
    button('Verify code')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Invalid code'))

    button('Use different email')!.click()
    await settle()
    expect(field('Sign-in code')).toBeUndefined()
    expect(field('Email')!.readOnly).toBe(false)
  })

  it('shows an error when the code cannot be sent', async () => {
    backend.failNext('POST', '/api/auth/code/send', 429, { error: 'Too many requests' })
    await mountApp('/login')
    await waitFor(() => expect(field('Email')).toBeDefined())
    typeInto(field('Email')!, 'ada@example.test')
    await settle()
    button('Send code')!.click()
    await waitFor(() => expect(document.body.textContent).toContain('Too many requests'))
    expect(field('Sign-in code')).toBeUndefined()
  })

  it('signs in from an emailed link (email + code in the URL) and opens the invited site', async () => {
    const { router } = await mountApp(`/login?email=ada%40example.test&code=123-456&siteId=${ID.wiki}`)
    await waitFor(() => expect(backend.calls('POST', '/api/auth/code/verify')).toHaveLength(1))
    expect(backend.calls('POST', '/api/auth/code/verify')[0].body).toMatchObject({ code: '123456' })
    await waitFor(() => expect(router.currentRoute.value.path).toBe(`/site/${ID.wiki}`), { timeout: 5000 })
  })
})
