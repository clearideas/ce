import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SuperTest, Test } from 'supertest'
import supertest from 'supertest'
import { createTestCeRuntime, signIn, type TestCeRuntime } from '../harness/runtime.js'

/**
 * Plan item 3.8 (Active sessions). The CE auth router mounts Better Auth as a catch-all
 * (`router.all('/{*any}', toNodeHandler(ctx.auth))`), which should expose Better Auth's session
 * management endpoints. This test establishes whether they are reachable through the CE app, which
 * decides whether Settings → Active sessions can list and revoke real sessions.
 */
describe('Better Auth session endpoints through the CE API', () => {
  let ctx: TestCeRuntime
  let agent: SuperTest<Test>

  beforeAll(async () => {
    ctx = await createTestCeRuntime()
    agent = ctx.agent
    await signIn({ agent, email: ctx.email, address: 'sessions@clearideas.local', name: 'Sessions User' })
  })

  afterAll(async () => {
    await ctx.close()
  })

  it('lists the current user’s sessions', async () => {
    const response = await agent.get('/api/auth/list-sessions')
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThanOrEqual(1)
    const session = response.body[0]
    expect(session).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        token: expect.any(String),
        expiresAt: expect.any(String),
      }),
    )
  })

  it('revokes another session by token', async () => {
    // A second sign-in (a second "browser") for the same user creates a second session.
    const otherBrowser = supertest.agent(ctx.runtime.app)
    await signIn({
      agent: otherBrowser,
      email: ctx.email,
      address: 'sessions@clearideas.local',
      name: 'Sessions User',
    })

    const sessions = (await agent.get('/api/auth/list-sessions').expect(200)).body as Array<{ token: string }>
    expect(sessions.length).toBeGreaterThanOrEqual(2)
    const current = (await agent.get('/api/auth/get-session').expect(200)).body as {
      session: { token: string }
    }
    const target = sessions.find(session => session.token !== current.session.token)!
    expect(target).toBeDefined()

    const revoke = await agent.post('/api/auth/revoke-session').send({ token: target.token })
    expect(revoke.status, JSON.stringify(revoke.body)).toBe(200)
    expect(revoke.body).toEqual(expect.objectContaining({ status: true }))

    const after = (await agent.get('/api/auth/list-sessions').expect(200)).body as Array<{ token: string }>
    expect(after.some(session => session.token === target.token)).toBe(false)
    // The revoked browser is signed out.
    await otherBrowser.get('/api/auth/session').expect(401)
  })

  it('revokes all other sessions', async () => {
    const response = await agent.post('/api/auth/revoke-other-sessions').send({})
    expect(response.status, JSON.stringify(response.body)).toBe(200)
    expect(response.body).toEqual(expect.objectContaining({ status: true }))
  })
})
