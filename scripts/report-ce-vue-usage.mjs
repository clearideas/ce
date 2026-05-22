#!/usr/bin/env node
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const sourceRoot = path.join(root, 'apps/clearideas-ce/src-web/src')
const focusArg = valueAfter('--file')
const json = args.includes('--json')
const markdown = args.includes('--markdown')
const outFile = valueAfter('--out')
const all = args.includes('--all')
const minConfidence = all ? 'used' : (valueAfter('--min-confidence') ?? 'unused')

const confidenceRank = {
  used: 0,
  possible: 1,
  unused: 2,
}

const allSourceFiles = (await listFiles(sourceRoot))
  .filter(file => /\.(vue|ts)$/.test(file))
  .filter(file => !file.endsWith('.d.ts'))

const vueFiles = allSourceFiles
  .filter(file => file.endsWith('.vue'))
  .filter(
    file =>
      !focusArg ||
      toPosix(path.relative(root, file)).endsWith(focusArg) ||
      path.basename(file) === focusArg,
  )

const sourceDocuments = await Promise.all(
  allSourceFiles.map(async file => ({
    file,
    relative: toPosix(path.relative(root, file)),
    text: stripVueStyles(await fs.readFile(file, 'utf8')),
  })),
)

const reachableFiles = await findReachableFiles()
const vueFileRows = vueFiles.map(file => ({
  file: toPosix(path.relative(root, file)),
  status: reachableFiles.has(path.resolve(file)) ? 'used' : 'unused',
  reason: reachableFiles.has(path.resolve(file))
    ? 'reachable from CE web entrypoint'
    : 'not reached from CE web entrypoint import graph',
}))

const vueClassRows = []
for (const file of vueFiles) {
  const text = await fs.readFile(file, 'utf8')
  const sourceText = stripVueStyles(text)
  const definitions = extractVueStyleClasses(text, file)
  const grouped = new Map()
  for (const definition of definitions) {
    const key = `${definition.file}:${definition.className}`
    if (!grouped.has(key)) grouped.set(key, definition)
  }

  for (const definition of grouped.values()) {
    const sameFileUsages = findUsagesInText(
      sourceText,
      definition.className,
      toPosix(path.relative(root, file)),
    )
    const projectUsages = sameFileUsages.length > 0 ? [] : findProjectUsages(definition.className)
    const dynamicUsages =
      sameFileUsages.length === 0 && projectUsages.length === 0
        ? findDynamicUsages(definition.className)
        : []
    const classified = classifyVueClass(definition, sameFileUsages, projectUsages, dynamicUsages)
    vueClassRows.push({
      file: toPosix(path.relative(root, definition.file)),
      line: definition.line,
      className: definition.className,
      confidence: classified.confidence,
      reason: classified.reason,
      sameFileUsages: sameFileUsages.slice(0, 5),
      projectUsages: projectUsages.slice(0, 5),
      dynamicUsages: dynamicUsages.slice(0, 5),
    })
  }
}

const filteredClassRows = vueClassRows
  .filter(row => confidenceRank[row.confidence] >= confidenceRank[minConfidence])
  .sort(sortClassRows)
const filteredFileRows = vueFileRows
  .filter(row => all || row.status === 'unused')
  .sort((a, b) => a.status.localeCompare(b.status) || a.file.localeCompare(b.file))

const report = {
  summary: {
    vueFiles: vueFileRows.length,
    reachableVueFiles: vueFileRows.filter(row => row.status === 'used').length,
    unreachableVueFiles: vueFileRows.filter(row => row.status === 'unused').length,
    vueStyleClasses: vueClassRows.length,
    usedVueStyleClasses: vueClassRows.filter(row => row.confidence === 'used').length,
    possibleVueStyleClasses: vueClassRows.filter(row => row.confidence === 'possible').length,
    unusedVueStyleClasses: vueClassRows.filter(row => row.confidence === 'unused').length,
  },
  vueFiles: filteredFileRows,
  vueStyleClasses: filteredClassRows,
}

if (json) {
  await writeOutput(JSON.stringify(report, null, 2))
} else if (markdown) {
  await writeOutput(renderMarkdown(report))
} else {
  await writeOutput(renderText(report))
}

async function findReachableFiles() {
  const candidates = new Set(allSourceFiles.map(file => path.resolve(file)))
  const entries = [path.join(sourceRoot, 'main.ts')]
  const reachable = new Set()
  const queue = entries.map(file => path.resolve(file)).filter(file => candidates.has(file))

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

  return reachable
}

function extractVueStyleClasses(text, file) {
  const definitions = []
  const styleBlocks = [...text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
  for (const block of styleBlocks) {
    const before = text.slice(0, block.index ?? 0)
    const startLine = before.split(/\r?\n/).length
    const content = block[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    const lines = content.split(/\r?\n/)
    const selectorPattern = /(^|[\s,{>+~:(])\.([A-Za-z_-][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])/g

    lines.forEach((lineText, index) => {
      if (lineText.trim().startsWith('@')) return
      for (const match of lineText.matchAll(selectorPattern)) {
        const className = match[2]
        if (isSelectorNoise(className, lineText)) continue
        definitions.push({ file, line: startLine + index, className, selector: lineText.trim() })
      }
    })
  }
  return definitions
}

function findUsagesInText(text, className, relative) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(className)}($|[^A-Za-z0-9_-])`)
  const usages = []
  const lines = text.split(/\r?\n/)
  lines.forEach((lineText, index) => {
    if (!pattern.test(lineText)) return
    usages.push({ file: relative, line: index + 1 })
  })
  return usages
}

function findProjectUsages(className) {
  const usages = []
  for (const document of sourceDocuments) {
    usages.push(...findUsagesInText(document.text, className, document.relative))
  }
  return usages
}

function findDynamicUsages(className) {
  const vueTransitionBase = getVueTransitionBase(className)
  if (vueTransitionBase) {
    const transitionUsages = findVueTransitionUsages(vueTransitionBase)
    if (transitionUsages.length > 0) return transitionUsages
  }

  const segments = className.split(/--|__/).filter(Boolean)
  const base = segments[0]
  if (!base || base.length < 5) return []
  const pattern = new RegExp(escapeRegExp(base))
  const usages = []
  for (const document of sourceDocuments) {
    const lines = document.text.split(/\r?\n/)
    lines.forEach((lineText, index) => {
      if (!pattern.test(lineText)) return
      usages.push({ file: document.relative, line: index + 1 })
    })
  }
  return usages
}

function getVueTransitionBase(className) {
  const match = className.match(/^(.+)-(?:enter|leave|appear)-(?:active|from|to)$/)
  return match?.[1] ?? null
}

function findVueTransitionUsages(name) {
  const usages = []
  const quotedNamePattern = new RegExp(`\\bname=["']${escapeRegExp(name)}["']`)
  const boundNamePattern = new RegExp(`\\b:name=["']${escapeRegExp(name)}["']`)
  for (const document of sourceDocuments) {
    const lines = document.text.split(/\r?\n/)
    lines.forEach((lineText, index) => {
      if (!quotedNamePattern.test(lineText) && !boundNamePattern.test(lineText)) return
      usages.push({ file: document.relative, line: index + 1 })
    })
  }
  return usages
}

function classifyVueClass(definition, sameFileUsages, projectUsages, dynamicUsages) {
  if (isKnownRuntimeClass(definition.className)) {
    return {
      confidence: 'possible',
      reason: 'third-party/runtime class; verify visually before deleting',
    }
  }
  if (sameFileUsages.length > 0) {
    return {
      confidence: 'used',
      reason: 'class name appears outside style block in the same Vue file',
    }
  }
  if (projectUsages.length > 0) {
    return {
      confidence: 'possible',
      reason: 'class name appears in another Vue/TS file; may be global child styling',
    }
  }
  if (dynamicUsages.length > 0) {
    return {
      confidence: 'possible',
      reason: 'base class appears in source; modifier may be dynamic or chained',
    }
  }
  return {
    confidence: 'unused',
    reason: 'no static or likely dynamic Vue/TS source reference found',
  }
}

function extractImportSpecifiers(text) {
  const specifiers = []
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+)?['"]([^'"]+)['"]/g
  const dynamicImportPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  for (const pattern of [importExportPattern, dynamicImportPattern]) {
    for (const match of text.matchAll(pattern)) specifiers.push(match[1])
  }
  return specifiers
}

function resolveSpecifier(fromFile, specifier) {
  if (specifier.startsWith('@/')) {
    return resolveCandidate(path.join(sourceRoot, specifier.slice(2)))
  }
  if (!specifier.startsWith('.')) return null
  return resolveCandidate(path.resolve(path.dirname(fromFile), specifier))
}

function resolveCandidate(base) {
  const candidates = [base, `${base}.ts`, `${base}.vue`, path.join(base, 'index.ts')]
  for (const candidate of candidates) {
    try {
      if (fsSync.statSync(candidate).isFile()) return path.resolve(candidate)
    } catch {
      // Try next candidate.
    }
  }
  return null
}

function renderText(currentReport) {
  const lines = [
    'CE Vue usage report',
    `- Vue files: ${currentReport.summary.vueFiles}`,
    `- Reachable Vue files: ${currentReport.summary.reachableVueFiles}`,
    `- Unreachable Vue files: ${currentReport.summary.unreachableVueFiles}`,
    `- Vue style classes: ${currentReport.summary.vueStyleClasses}`,
    `- Used Vue style classes: ${currentReport.summary.usedVueStyleClasses}`,
    `- Possible/runtime Vue style classes: ${currentReport.summary.possibleVueStyleClasses}`,
    `- Unused Vue style classes: ${currentReport.summary.unusedVueStyleClasses}`,
    '',
    'Unreachable Vue files:',
  ]
  for (const row of currentReport.vueFiles) {
    lines.push(`[${row.status}] ${row.file} - ${row.reason}`)
  }
  lines.push('', 'Vue style classes:')
  for (const row of currentReport.vueStyleClasses) {
    lines.push(`[${row.confidence}] .${row.className} ${row.file}:${row.line} - ${row.reason}`)
    for (const usage of row.sameFileUsages)
      lines.push(`  same-file use at ${usage.file}:${usage.line}`)
    for (const usage of row.projectUsages)
      lines.push(`  project use at ${usage.file}:${usage.line}`)
    for (const usage of row.dynamicUsages)
      lines.push(`  possible dynamic use at ${usage.file}:${usage.line}`)
  }
  return lines.join('\n')
}

function renderMarkdown(currentReport) {
  const lines = [
    '# CE Vue Usage Report',
    '',
    '## Summary',
    '',
    `- Vue files: ${currentReport.summary.vueFiles}`,
    `- Reachable Vue files: ${currentReport.summary.reachableVueFiles}`,
    `- Unreachable Vue files: ${currentReport.summary.unreachableVueFiles}`,
    `- Vue style classes: ${currentReport.summary.vueStyleClasses}`,
    `- Used Vue style classes: ${currentReport.summary.usedVueStyleClasses}`,
    `- Possible/runtime Vue style classes: ${currentReport.summary.possibleVueStyleClasses}`,
    `- Unused Vue style classes: ${currentReport.summary.unusedVueStyleClasses}`,
    '',
    '## Vue Files',
    '',
    '| Status | File | Reason |',
    '| --- | --- | --- |',
  ]
  for (const row of currentReport.vueFiles) {
    lines.push(`| ${row.status} | \`${row.file}\` | ${row.reason} |`)
  }
  lines.push('', '## Vue Style Classes', '')
  for (const row of currentReport.vueStyleClasses) {
    lines.push(`### \`.${row.className}\``)
    lines.push('')
    lines.push(`- Status: \`${row.confidence}\``)
    lines.push(`- Defined: \`${row.file}:${row.line}\``)
    lines.push(`- Reason: ${row.reason}`)
    for (const usage of row.sameFileUsages)
      lines.push(`- Same-file use: \`${usage.file}:${usage.line}\``)
    for (const usage of row.projectUsages)
      lines.push(`- Project use: \`${usage.file}:${usage.line}\``)
    for (const usage of row.dynamicUsages)
      lines.push(`- Possible dynamic use: \`${usage.file}:${usage.line}\``)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function sortClassRows(a, b) {
  const confidenceDelta = confidenceRank[b.confidence] - confidenceRank[a.confidence]
  if (confidenceDelta !== 0) return confidenceDelta
  return `${a.file}:${a.line}:${a.className}`.localeCompare(`${b.file}:${b.line}:${b.className}`)
}

function isKnownRuntimeClass(className) {
  if (className.startsWith('v-')) return true
  if (className.startsWith('fa-')) return true
  if (className.startsWith('hljs')) return true
  if (className.startsWith('tippy-')) return true
  if (className === 'svg-inline--fa') return true
  if (className === 'markedContent') return true
  return false
}

function isSelectorNoise(className, lineText) {
  if (lineText.includes('#{')) return true
  if (/^\d/.test(className)) return true
  return false
}

function stripVueStyles(text) {
  let output = text
  while (/<style\b/i.test(output)) {
    const next = output.replace(/<style\b[\s\S]*?<\/style>/i, '')
    if (next === output) break
    output = next
  }
  return output
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map(async entry => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (
            [
              'node_modules',
              'dist',
              'web',
              'data',
              'coverage',
              'test-results',
              'playwright-report',
            ].includes(entry.name)
          )
            return []
          return listFiles(full)
        }
        return [full]
      }),
    )
    return nested.flat()
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

async function writeOutput(content) {
  if (!outFile) {
    console.log(content)
    return
  }
  const target = path.resolve(root, outFile)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${content.replace(/\n?$/, '\n')}`)
  console.log(`Wrote Vue usage report: ${toPosix(path.relative(root, target))}`)
}

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}
