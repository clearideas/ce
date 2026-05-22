#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const sourceRoots = [
  'apps/clearideas-ce/src',
  'apps/clearideas-ce/src-web/src',
]
const serverContainerExcluded = new Set([
  'DEMO_SITE_NAME',
  'CE_SMOKE_API_BASE_PATH',
  'CE_SMOKE_BASE_URL',
  'CE_SMOKE_CODE',
  'CE_SMOKE_EMAIL',
])

const usedEnvKeys = new Set()
for (const sourceRoot of sourceRoots) {
  for (const file of await listFiles(path.join(root, sourceRoot))) {
    if (!/\.(ts|vue)$/.test(file)) continue
    const text = await fs.readFile(file, 'utf8')
    for (const match of text.matchAll(/\bprocess\.env\.([A-Z0-9_]+)/g)) {
      usedEnvKeys.add(match[1])
    }
  }
}

const requiredServerKeys = [...usedEnvKeys]
  .filter(key => !serverContainerExcluded.has(key))
  .sort()
const publicComposePath = await firstExistingPath([
  'apps/clearideas-ce/public-repo/docker-compose.yml',
  'docker-compose.yml',
])
const publicEnvExamplePath = await firstExistingPath([
  'apps/clearideas-ce/public-repo/.env.example',
  '.env.example',
])
const composeText = await fs.readFile(publicComposePath, 'utf8')
const envExampleText = await fs.readFile(publicEnvExamplePath, 'utf8')
const composeKeys = new Set([...composeText.matchAll(/^\s{6}([A-Z0-9_]+):/gm)].map(match => match[1]))
const envExampleKeys = new Set([...envExampleText.matchAll(/^([A-Z0-9_]+)=/gm)].map(match => match[1]))
const failures = []

for (const key of requiredServerKeys) {
  if (!composeKeys.has(key)) failures.push(`docker-compose.yml does not pass ${key}`)
}

for (const key of requiredServerKeys) {
  if (key === 'NODE_ENV') continue
  if (!envExampleKeys.has(key)) failures.push(`.env.example does not document ${key}`)
}

if (failures.length > 0) {
  console.error('CE env contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('CE env contract OK')

async function listFiles(dir) {
  const out = []
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'web') continue
      out.push(...await listFiles(full))
    } else {
      out.push(full)
    }
  }
  return out
}

async function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    const fullPath = path.join(root, candidate)
    try {
      await fs.access(fullPath)
      return fullPath
    } catch {
      // Try the next public layout.
    }
  }
  throw new Error(`None of these paths exist: ${candidates.join(', ')}`)
}
