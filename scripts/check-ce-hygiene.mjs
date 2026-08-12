#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const failures = []
const warnings = []

await checkNoUnusedTypeScript()
await checkNoTrackedRuntimeArtifacts()
await checkForbiddenSourceTerms()
await checkOrphanScss()
await checkReachableSourceFiles()

if (warnings.length > 0) {
  console.warn('CE hygiene warnings:')
  for (const warning of warnings) console.warn(`- ${warning}`)
}

if (failures.length > 0) {
  console.error('CE hygiene failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('CE hygiene OK')

async function checkNoUnusedTypeScript() {
  const projects = [
    'packages/clearideas-core/tsconfig.json',
    'apps/clearideas-ce/tsconfig.json',
  ]

  for (const project of projects) {
    if (!await exists(path.join(root, project))) continue
    const result = spawnSync(
      'npx',
      ['tsc', '-p', project, '--noEmit', '--noUnusedLocals', '--noUnusedParameters', '--pretty', 'false'],
      { cwd: root, encoding: 'utf8', shell: false },
    )
    if (result.status !== 0) {
      failures.push(`Unused TypeScript check failed for ${project}\n${trimCommandOutput(result)}`)
    }
  }
}

async function checkNoTrackedRuntimeArtifacts() {
  const result = spawnSync(
    'git',
    ['ls-files', 'apps/clearideas-ce/**/data/**', 'apps/clearideas-ce/**/storage/**', 'apps/clearideas-ce/**/test-results/**', 'apps/clearideas-ce/**/playwright-report/**'],
    { cwd: root, encoding: 'utf8', shell: false },
  )
  if (result.status !== 0) {
    if (/not a git repository/i.test(result.stderr ?? '')) {
      warnings.push('Skipped tracked CE runtime artifact check because the export target is not a Git worktree')
      return
    }
    failures.push(`Unable to inspect tracked CE runtime artifacts\n${trimCommandOutput(result)}`)
    return
  }
  const files = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (files.length > 0) failures.push(`Tracked CE runtime artifacts must be removed:\n${files.join('\n')}`)
}

async function checkForbiddenSourceTerms() {
  const roots = [
    'packages/clearideas-core/src',
    'apps/clearideas-ce/src',
    'apps/clearideas-ce/src-web/src',
  ]
  const patterns = [
    { name: 'enterprise wording', pattern: /\benterprise\b/i },
    { name: 'private API source reference', pattern: /clearideas-api\/src/i },
    { name: 'architecture mode flag', pattern: /\b(isEnterprise|enterpriseEnabled|ceMode|saasMode)\b/i },
    { name: 'archive feature leakage', pattern: /\barchivedMode\b|\barchived\b/i },
    { name: 'billing feature leakage', pattern: /\b(billing|stripe)\b/i },
    { name: 'OIDC feature leakage', pattern: /\boidc\b/i },
    { name: 'governance feature leakage', pattern: /\bgovernance\b/i },
    { name: 'redaction feature leakage', pattern: /\bredaction\b/i },
  ]
  const allowed = [
    /src\/controllers\/core\/core\.controller\.ts:.*signature/i,
    /src-web\/src\/components\/content\/actions\/UploadStatus\.vue:.*striped/i,
    /packages\/clearideas-core\/src\/services\/mcp\.ts:.*Mongo.*Stripe.*CloudWatch/i,
  ]

  for (const sourceRoot of roots) {
    for (const file of await listFiles(path.join(root, sourceRoot))) {
      if (!isSourceTextFile(file)) continue
      const relative = toPosix(path.relative(root, file))
      const lines = (await fs.readFile(file, 'utf8')).split(/\r?\n/)
      lines.forEach((line, index) => {
        const location = `${relative}:${index + 1}:${line}`
        if (allowed.some(pattern => pattern.test(location))) return
        const hit = patterns.find(({ pattern }) => pattern.test(line))
        if (hit) failures.push(`${hit.name}: ${relative}:${index + 1}`)
      })
    }
  }
}

async function checkOrphanScss() {
  const styleRoot = path.join(root, 'apps/clearideas-ce/src-web/src/styles')
  if (!await exists(styleRoot)) return

  const files = (await listFiles(styleRoot)).filter(file => file.endsWith('.scss'))
  const projectText = await readProjectText([
    'apps/clearideas-ce/src-web/src',
    'apps/clearideas-ce/vite.config.ts',
  ])

  for (const file of files) {
    const relative = toPosix(path.relative(styleRoot, file)).replace(/\.scss$/, '')
    if (relative === 'main') continue
    const basename = path.posix.basename(relative)
    const isReferenced =
      projectText.includes(`@use '${relative}'`) ||
      projectText.includes(`@use "${relative}"`) ||
      projectText.includes(`@import '${relative}'`) ||
      projectText.includes(`@import "${relative}"`) ||
      projectText.includes(`styles/${relative}.scss`) ||
      projectText.includes(`src/styles/${relative}.scss`) ||
      projectText.includes(`/${relative}.scss`) ||
      projectText.includes(`@use '${basename}'`) ||
      projectText.includes(`@use "${basename}"`)

    if (!isReferenced) failures.push(`Orphan SCSS file is not imported/configured: apps/clearideas-ce/src-web/src/styles/${relative}.scss`)
  }
}

async function checkReachableSourceFiles() {
  const roots = [
    'packages/clearideas-core/src',
    'apps/clearideas-ce/src',
    'apps/clearideas-ce/src-web/src',
  ]
  const candidates = new Set()
  for (const sourceRoot of roots) {
    for (const file of await listFiles(path.join(root, sourceRoot))) {
      if (/\.(ts|vue)$/.test(file) && !file.endsWith('.d.ts')) candidates.add(path.resolve(file))
    }
  }

  const entries = [
    'packages/clearideas-core/src/index.ts',
    'apps/clearideas-ce/src/server.ts',
    'apps/clearideas-ce/src/app.ts',
    'apps/clearideas-ce/src/scripts/seed.ts',
    'apps/clearideas-ce/src/scripts/smoke.ts',
    'apps/clearideas-ce/src-web/src/main.ts',
  ]
  await addCorePackageExportEntries(entries)

  const reachable = new Set()
  const queue = entries.map(entry => path.resolve(root, entry)).filter(file => candidates.has(file))
  while (queue.length > 0) {
    const file = queue.pop()
    if (!file || reachable.has(file)) continue
    reachable.add(file)
    const text = await fs.readFile(file, 'utf8')
    for (const specifier of extractImportSpecifiers(text)) {
      const resolved = resolveSpecifier(file, specifier)
      if (resolved && candidates.has(resolved) && !reachable.has(resolved)) queue.push(resolved)
    }
  }

  const orphans = []
  for (const file of [...candidates].sort()) {
    const relative = toPosix(path.relative(root, file))
    if (reachable.has(file)) continue
    if (relative.includes('/test/') || relative.includes('/tests/')) continue
    orphans.push(relative)
  }

  if (args.includes('--report-orphans')) {
    for (const orphan of orphans) {
      warnings.push(`Potential orphan source file not reached from CE/core entrypoints: ${orphan}`)
    }
  }
}

async function addCorePackageExportEntries(entries) {
  const packagePath = path.join(root, 'packages/clearideas-core/package.json')
  if (!await exists(packagePath)) return
  const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'))
  for (const target of Object.values(pkg.exports ?? {})) {
    if (typeof target !== 'string') continue
    if (!target.startsWith('./dist/')) continue
    entries.push(`packages/clearideas-core/src/${target.replace('./dist/', '').replace(/\.js$/, '.ts')}`)
  }
}

function extractImportSpecifiers(text) {
  const specifiers = []
  const importExportPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const pattern of [importExportPattern, dynamicImportPattern]) {
    for (const match of text.matchAll(pattern)) specifiers.push(match[1])
  }
  return specifiers
}

function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return resolveCandidate(path.join(root, 'apps/clearideas-ce/src-web/src', specifier.slice(2)))
  }
  if (!specifier.startsWith('.')) return null
  return resolveCandidate(path.resolve(path.dirname(fromFile), specifier))
}

function resolveCandidate(base) {
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.vue`,
    path.join(base, 'index.ts'),
  ]
  for (const candidate of candidates) {
    try {
      if (requireStatSync(candidate)) return path.resolve(candidate)
    } catch {
      // Keep trying candidates.
    }
  }
  return null
}

function requireStatSync(file) {
  return Boolean(fsSyncStat(file))
}

function fsSyncStat(file) {
  try {
    return statCache.get(file) ?? setStatCache(file)
  } catch {
    return false
  }
}

const statCache = new Map()
function setStatCache(file) {
  const stat = fsSync.statSync(file)
  const exists = stat.isFile()
  statCache.set(file, exists)
  return exists
}

async function readProjectText(paths) {
  const chunks = []
  for (const relativePath of paths) {
    const full = path.join(root, relativePath)
    if (!await exists(full)) continue
    const stat = await fs.stat(full)
    if (stat.isFile()) {
      chunks.push(await fs.readFile(full, 'utf8'))
      continue
    }
    for (const file of await listFiles(full)) {
      if (isSourceTextFile(file) || file.endsWith('.scss')) chunks.push(await fs.readFile(file, 'utf8'))
    }
  }
  return chunks.join('\n')
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(entries.map(async entry => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', 'web', 'data', 'coverage', 'test-results', 'playwright-report'].includes(entry.name)) return []
        return listFiles(full)
      }
      return [full]
    }))
    return nested.flat()
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isSourceTextFile(file) {
  return /\.(ts|vue|scss)$/.test(file)
}

function trimCommandOutput(result) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}
