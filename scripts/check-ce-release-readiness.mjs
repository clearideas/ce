#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const targetArg = valueAfter('--target') ?? '.'
const target = path.resolve(process.cwd(), targetArg)
const failures = []
const requiredFiles = [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  '.env.example',
  '.npmrc',
  '.gitignore',
  '.dockerignore',
  'Caddyfile',
  'docker-compose.yml',
  'docker-compose.dev.yml',
  'docker-compose.local-mongo.yml',
  'docker-compose.quickstart.yml',
  'package.json',
  'scripts/check-import-boundaries.mjs',
  'scripts/check-ce-env-contract.mjs',
  'scripts/check-ce-hygiene.mjs',
  'scripts/check-ce-release-readiness.mjs',
  'scripts/report-ce-css-usage.mjs',
  'scripts/report-ce-vue-usage.mjs',
  'packages/clearideas-contracts-core/package.json',
  'packages/clearideas-core/package.json',
  'apps/clearideas-ce/package.json',
  'apps/clearideas-ce/Dockerfile',
  'apps/clearideas-ce/src-web/public/docs/index.json',
]
const requiredEnv = [
  'HOST',
  'PORT',
  'APP_URL',
  'BETTER_AUTH_SECRET',
  'MONGODB_URI',
  'FIRST_USER_EMAIL',
  'HTTPS_REQUIRED',
  'EMAIL_PROVIDER',
  'STORAGE_ROOT',
  'SEARCH_INDEX_ROOT',
]
const forbiddenPaths = [
  'src',
  'server.ts',
  'worker.ts',
  'metrics.ts',
  '.env',
  '.env.development',
  '.env.test',
  'apps/clearideas-ce/node_modules',
  'apps/clearideas-ce/dist',
  'apps/clearideas-ce/web',
  'apps/clearideas-ce/data',
  'apps/clearideas-ce/package-lock.json',
  'packages/clearideas-core/package-lock.json',
  'node_modules',
  'dist',
  'web',
]
const forbiddenDocPatterns = [
  /\bstripe\b/i,
  /\bbilling\b/i,
  /\borganization\b/i,
  /\boidc\b/i,
  /\bgovernance\b/i,
  /\bcompliance\b/i,
  /\bsignature\b/i,
  /\bredaction\b/i,
  /docs\.clearideas\.com/i,
  /clearideas-api\/src/i,
]
const forbiddenSourcePatterns = [
  /from\s+['"][^'"]*clearideas-api/i,
  /clearideas-api\/src/i,
  /\.env\.development/i,
  /npm\.fontawesome\.com/i,
]
const forbiddenPublicTextPatterns = [
  /\/Users\/[A-Za-z0-9._-]+\//,
  /docs\.clearideas\.com/i,
  /clearideas-api\/src/i,
  /\.env\.development/i,
]

for (const file of requiredFiles) {
  if (!await exists(path.join(target, file))) failures.push(`Missing required file: ${file}`)
}

for (const forbidden of forbiddenPaths) {
  if (await exists(path.join(target, forbidden))) failures.push(`Forbidden public export path exists: ${forbidden}`)
}

await validateRootDocsDirectory(target)

const envText = await readText(path.join(target, '.env.example'))
for (const key of requiredEnv) {
  if (!new RegExp(`^${escapeRegExp(key)}=`, 'm').test(envText)) failures.push(`.env.example missing ${key}`)
}

const licenseText = await readText(path.join(target, 'LICENSE'))
if (!/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(licenseText)) failures.push('LICENSE is not AGPL-3.0 text')

for (const file of await listFiles(path.join(target, 'apps/clearideas-ce/src-web/public/docs'))) {
  const text = await fs.readFile(file, 'utf8')
  if (forbiddenDocPatterns.some(pattern => pattern.test(text))) {
    failures.push(`CE docs contain public-inappropriate wording: ${path.relative(target, file)}`)
  }
}

for (const root of ['packages/clearideas-core/src', 'apps/clearideas-ce/src', 'apps/clearideas-ce/src-web/src']) {
  for (const file of await listFiles(path.join(target, root))) {
    const text = await fs.readFile(file, 'utf8')
    if (forbiddenSourcePatterns.some(pattern => pattern.test(text))) {
      failures.push(`Source boundary violation: ${path.relative(target, file)}`)
    }
  }
}

for (const file of await listFiles(target)) {
  const relative = path.relative(target, file)
  if (isGeneratedPublicPath(relative)) continue
  if (!isPublicTextFile(relative)) continue
  const text = await fs.readFile(file, 'utf8')
  if (forbiddenPublicTextPatterns.some(pattern => pattern.test(text))) {
    failures.push(`Public text contains private-only reference: ${relative}`)
  }
}

const packageJson = JSON.parse(await readText(path.join(target, 'package.json')))
if (packageJson.private !== false) failures.push('Public package.json must set private=false')
if (packageJson.license !== 'AGPL-3.0-only') failures.push('Public package.json must use AGPL-3.0-only')
for (const script of ['build', 'test', 'build:contracts:core', 'bootstrap:ce', 'test:ce', 'test:ce:e2e', 'check:import-boundaries', 'check:ce-env-contract', 'check:ce-hygiene', 'report:ce-css-usage', 'report:ce-vue-usage', 'check:ce-release']) {
  if (!packageJson.scripts?.[script]) failures.push(`Public package.json missing script: ${script}`)
}

const npmrcText = await readText(path.join(target, '.npmrc'))
if (!/@fortawesome:registry=https:\/\/registry\.npmjs\.org\//.test(npmrcText)) {
  failures.push('.npmrc must force @fortawesome packages to the public npm registry')
}

if (failures.length > 0) {
  console.error('CE release readiness failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(`CE release readiness OK: ${target}`)

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readText(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(full)
      return [full]
    }))
    return nested.flat()
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isPublicTextFile(relativePath) {
  if (relativePath === 'scripts/check-ce-release-readiness.mjs') return false
  return [
    '.md',
    '.json',
    '.yml',
    '.yaml',
    '.mjs',
    '.ts',
    '.vue',
    '.example',
  ].some(ext => relativePath.endsWith(ext))
}

function isGeneratedPublicPath(relativePath) {
  return relativePath.split(path.sep).some(part => [
    'node_modules',
    'dist',
    'web',
    'data',
    'coverage',
    'test-results',
    'playwright-report',
  ].includes(part))
}

async function validateRootDocsDirectory(target) {
  const docsDir = path.join(target, 'docs')
  if (!await exists(docsDir)) return

  for (const file of await listFiles(docsDir)) {
    const relative = path.relative(docsDir, file)
    const parts = relative.split(path.sep)
    const extension = path.extname(file).toLowerCase()
    if (parts[0] !== 'screenshots' || !['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(extension)) {
      failures.push(`Forbidden public export docs path exists: ${path.join('docs', relative)}`)
    }
  }
}
