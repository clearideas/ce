import fs from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const sourceFilePattern = /\.(ts|tsx|vue|js|mjs)$/

const importFromContractsEnterprise = /(?:from|import)\s*(?:\(\s*)?['"]@clearideas\/contracts-enterprise(?:\/|['"])/

const boundaries = [
  {
    name: 'contracts-core does not mention enterprise-only contract concepts',
    roots: [path.join(repoRoot, 'packages/clearideas-contracts-core/src')],
    forbidden: [
      importFromContractsEnterprise,
      /from\s+['"][^'"]*private-api\/src/i,
      /from\s+['"]@(?:routes|controllers|middlewares|services|helpers|models|config|validation)(?:\/|['"])/,
      /\benterprise\b/i,
      /\bfeedback\b/i,
      /\borigin\b/i,
      /\bpublic(?:[\s._-]*chat|Chat)\b/i,
      /\bworkflow\b/i,
      /\bhitl\b|human[\s_-]*in[\s_-]*the[\s_-]*loop/i,
      /\b(?:totp|two[-_\s]*factor|twoFactor|TwoFactor|authenticator(?:App)?|saml|oidc)\b/,
      /\b(?:hybrid|semantic|vector|completion|full[-_\s]*text)\b/i,
      /\b(?:Mcp[A-Za-z]*Tool|CORE_MCP_TOOL|clearideas\.[a-z_]+|mcp[A-Za-z]*(?:Args|Tool)|MCP_[A-Z_]*TOOL)\b/,
    ],
  },
  {
    name: 'CE app/core does not import enterprise contracts or API source',
    roots: [
      path.join(repoRoot, 'packages/clearideas-core/src'),
      path.join(repoRoot, 'apps/clearideas-ce/src'),
      path.join(repoRoot, 'apps/clearideas-ce/src-web/src'),
    ],
    forbidden: [
      importFromContractsEnterprise,
      /from\s+['"][^'"]*private-api\/src/i,
      /from\s+['"][^'"]*\.\.\/\.\.\/\.\.\/src/i,
      /from\s+['"][^'"]*\.\.\/\.\.\/src/i,
      /isEnterprise|enterpriseEnabled|ceMode|saasMode/,
    ],
  },
]

describe('CE/core import boundaries', () => {
  it.each(boundaries)('$name', async ({ roots, forbidden }) => {
    const offenders: string[] = []
    for (const root of roots) {
      for (const file of await walk(root)) {
        const text = await fs.readFile(file, 'utf8')
        const relativeFile = path.relative(repoRoot, file)
        const source = `${relativeFile}\n${text}`
        if (forbidden.some(pattern => pattern.test(source))) offenders.push(relativeFile)
      }
    }
    expect(offenders).toEqual([])
  })
})

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return sourceFilePattern.test(entry.name) ? [full] : []
  }))
  return files.flat()
}
