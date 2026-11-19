import { describe, expect, it, vi } from 'vitest'
import { errorMessage } from '../../src-web/src/utils/errors'

const route = { name: 'site', params: { siteId: 's1' } }
vi.mock('vue-router', () => ({ useRoute: () => route }))

const { isNavLinkActive } = await import('../../src-web/src/layouts/components/utils')

describe('errorMessage', () => {
  it('prefers the Error message, then string, then object message/error, then the fallback', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom')
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback')
    expect(errorMessage('plain', 'fallback')).toBe('plain')
    expect(errorMessage({ message: 'from message' }, 'fallback')).toBe('from message')
    expect(errorMessage({ error: 'from error' }, 'fallback')).toBe('from error')
    expect(errorMessage({ error: 42 }, 'fallback')).toBe('fallback')
    expect(errorMessage(undefined, 'fallback')).toBe('fallback')
    expect(errorMessage(null, 'fallback')).toBe('fallback')
  })
})

describe('isNavLinkActive', () => {
  it('matches on route name and, when present, on every param', () => {
    expect(isNavLinkActive({ to: { name: 'site', params: { siteId: 's1' } } })).toBe(true)
    expect(isNavLinkActive({ to: { name: 'site', params: { siteId: 's2' } } })).toBe(false)
    expect(isNavLinkActive({ to: { name: 'site' } })).toBe(true)
    expect(isNavLinkActive({ to: { name: 'sites' } })).toBe(false)
  })

  it('is never active for string/path targets or items without a target', () => {
    expect(isNavLinkActive({ to: '/sites' })).toBe(false)
    expect(isNavLinkActive({ to: { path: '/sites' } })).toBe(false)
    expect(isNavLinkActive({})).toBe(false)
  })
})
