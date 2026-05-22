#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const importFromContractsEnterprise = /(?:from|import)\s*(?:\(\s*)?['"]@clearideas\/contracts-enterprise(?:\/|['"])/
const checks = [
  {
    name: 'core-must-not-import-api',
    dir: 'packages/clearideas-core/src',
    patterns: [
      importFromContractsEnterprise,
      /clearideas-api/i,
      /from\s+['"]@(?:routes|controllers|middlewares|services|helpers|models)(?:\/|['"])/,
    ],
  },
  {
    name: 'contracts-core-must-not-mention-enterprise-contracts',
    dir: 'packages/clearideas-contracts-core/src',
    patterns: [
      importFromContractsEnterprise,
      /from\s+['"][^'"]*clearideas-api/i,
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
    name: 'enterprise-web-must-not-import-clearideas-core',
    dir: '../clearideas-web/src',
    patterns: [/from\s+['"]@clearideas\/core(?:\/|['"])/],
  },
  {
    name: 'ce-must-not-import-api',
    dir: 'apps/clearideas-ce/src',
    patterns: [
      importFromContractsEnterprise,
      /from\s+['"][^'"]*clearideas-api/i,
      /from\s+['"]@(?:routes|controllers|services)(?:\/|['"])/,
      /from\s+['"][^'"]*\.\.\/\.\.\/\.\.\/src\//,
    ],
  },
  {
    name: 'ce-web-must-not-import-api',
    dir: 'apps/clearideas-ce/src-web/src',
    patterns: [
      importFromContractsEnterprise,
      /from\s+['"][^'"]*clearideas-api/i,
      /from\s+['"][^'"]*\.\.\/\.\.\/\.\.\/src\//,
    ],
  },
]

let failed = false
for (const check of checks) {
  const dir = path.join(root, check.dir)
  const offenders = []
  for (const file of await listFiles(dir)) {
    const text = await fs.readFile(file, 'utf8')
    const relativeFile = path.relative(root, file)
    const source = `${relativeFile}\n${text}`
    if (check.patterns.some(pattern => pattern.test(source))) offenders.push(relativeFile)
  }
  if (offenders.length > 0) {
    failed = true
    console.error(`FAIL ${check.name}`)
    for (const offender of offenders) console.error(`  ${offender}`)
  } else {
    console.log(`OK ${check.name}`)
  }
}

if (failed) process.exit(1)

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(full)
      return /\.(ts|tsx|vue|js|mjs)$/.test(entry.name) ? [full] : []
    }))
    return nested.flat()
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}
