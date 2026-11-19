import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ceEnvFiles } from '../../src/scripts/env.js'

/**
 * Which env files the server reads must not depend on the working directory or the OS. The old
 * cwd-based lookup skipped the repo-root `.env.ce` on Windows when started from the app folder
 * (`npm run dev:ce`), so e.g. AI_AGENT_MODEL was missing and Agents said it was not configured.
 */
describe('ceEnvFiles', () => {
  it('resolves the repo-root and app env files from the module location on Windows', () => {
    expect(ceEnvFiles('C:\\work\\ce-main\\apps\\clearideas-ce\\src\\scripts', path.win32)).toEqual([
      'C:\\work\\ce-main\\.env.ce.local',
      'C:\\work\\ce-main\\.env.ce',
      'C:\\work\\ce-main\\apps\\clearideas-ce\\.env.ce.local',
      'C:\\work\\ce-main\\apps\\clearideas-ce\\.env.ce',
    ])
  })

  it('finds the same files from the compiled build (dist/scripts) on POSIX', () => {
    expect(ceEnvFiles('/srv/app/apps/clearideas-ce/dist/scripts', path.posix)).toEqual([
      '/srv/app/.env.ce.local',
      '/srv/app/.env.ce',
      '/srv/app/apps/clearideas-ce/.env.ce.local',
      '/srv/app/apps/clearideas-ce/.env.ce',
    ])
  })

  it('by default points at this checkout, whatever the working directory is', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../../../..')
    expect(ceEnvFiles()[1]).toBe(path.join(repoRoot, '.env.ce'))
    expect(ceEnvFiles()[3]).toBe(path.join(repoRoot, 'apps', 'clearideas-ce', '.env.ce'))
  })
})
