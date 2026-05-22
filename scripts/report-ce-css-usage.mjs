#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const args = process.argv.slice(2)
const styleRoot = path.join(root, 'apps/clearideas-ce/src-web/src/styles')
const sourceRoot = path.join(root, 'apps/clearideas-ce/src-web/src')
const focusArg = valueAfter('--file')
const json = args.includes('--json')
const markdown = args.includes('--markdown')
const outFile = valueAfter('--out')
const all = args.includes('--all')
const minConfidence = all ? 'used' : (valueAfter('--min-confidence') ?? 'possible')

const confidenceRank = {
  used: 0,
  possible: 1,
  unused: 2,
}

const styleFiles = (await listFiles(styleRoot))
  .filter(file => file.endsWith('.scss'))
  .filter(
    file =>
      !focusArg ||
      toPosix(path.relative(root, file)).endsWith(focusArg) ||
      path.basename(file) === focusArg,
  )

const sourceFiles = (await listFiles(sourceRoot))
  .filter(file => /\.(vue|ts|html)$/.test(file))
  .filter(file => !file.includes('/styles/'))

const sourceDocuments = await Promise.all(
  sourceFiles.map(async file => ({
    file,
    relative: toPosix(path.relative(root, file)),
    text: stripVueStyles(await fs.readFile(file, 'utf8')),
  })),
)

const definitions = []
for (const file of styleFiles) {
  const text = await fs.readFile(file, 'utf8')
  for (const definition of extractClassDefinitions(text, file)) definitions.push(definition)
}

const grouped = new Map()
for (const definition of definitions) {
  const key = `${definition.file}:${definition.className}`
  if (!grouped.has(key)) grouped.set(key, definition)
}

const rows = [...grouped.values()]
  .map(definition => {
    const exactUsages = findExactUsages(definition.className)
    const dynamicUsages = exactUsages.length === 0 ? findDynamicUsages(definition.className) : []
    const reason = classifyDefinition(definition, exactUsages, dynamicUsages)
    return {
      file: toPosix(path.relative(root, definition.file)),
      line: definition.line,
      className: definition.className,
      confidence: reason.confidence,
      reason: reason.reason,
      usages: exactUsages.slice(0, 5),
      dynamicUsages: dynamicUsages.slice(0, 5),
    }
  })
  .filter(row => confidenceRank[row.confidence] >= confidenceRank[minConfidence])

rows.sort((a, b) => {
  const confidenceDelta = confidenceRank[b.confidence] - confidenceRank[a.confidence]
  if (confidenceDelta !== 0) return confidenceDelta
  return `${a.file}:${a.line}:${a.className}`.localeCompare(`${b.file}:${b.line}:${b.className}`)
})

if (json) {
  await writeOutput(
    JSON.stringify({ rows, summary: summarize(rows), byFile: summarizeByFile(rows) }, null, 2),
  )
} else if (markdown) {
  await writeOutput(renderMarkdown(rows))
} else {
  const summary = summarize(rows)
  const lines = [
    `CE CSS usage report: ${summary.total} class selectors shown`,
    `- unused: ${summary.unused}`,
    `- possible: ${summary.possible}`,
    `- used: ${summary.used}`,
    '',
  ]
  for (const row of rows) {
    lines.push(`[${row.confidence}] .${row.className} ${row.file}:${row.line} - ${row.reason}`)
    for (const usage of row.usages) lines.push(`  used at ${usage.file}:${usage.line}`)
    for (const usage of row.dynamicUsages)
      lines.push(`  possible dynamic use at ${usage.file}:${usage.line}`)
  }
  await writeOutput(lines.join('\n'))
}

function extractClassDefinitions(text, file) {
  const definitions = []
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const lines = withoutComments.split(/\r?\n/)
  const selectorPattern = /(^|[\s,{>+~])\.([A-Za-z_-][A-Za-z0-9_-]*)(?![A-Za-z0-9_-])/g

  lines.forEach((lineText, index) => {
    if (lineText.trim().startsWith('@')) return
    for (const match of lineText.matchAll(selectorPattern)) {
      const className = match[2]
      if (isSelectorNoise(className, lineText)) continue
      definitions.push({ file, line: index + 1, className })
    }
  })

  return definitions
}

function findExactUsages(className) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(className)}($|[^A-Za-z0-9_-])`)
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

function findDynamicUsages(className) {
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

function classifyDefinition(definition, exactUsages, dynamicUsages) {
  if (isKnownExternalClass(definition.className, definition.file)) {
    return {
      confidence: 'possible',
      reason: 'third-party/runtime class; verify visually before deleting',
    }
  }
  if (exactUsages.length > 0) {
    return { confidence: 'used', reason: 'class name appears in Vue/TS source' }
  }
  if (dynamicUsages.length > 0) {
    return {
      confidence: 'possible',
      reason: 'base class appears in source; modifier may be dynamic or chained',
    }
  }
  return { confidence: 'unused', reason: 'no static or likely dynamic source reference found' }
}

function isKnownExternalClass(className, file) {
  const relative = toPosix(path.relative(root, file))
  if (relative.includes('/libs/toastify.scss')) return true
  if (className.startsWith('v-')) return true
  if (className.startsWith('hljs')) return true
  if (className.startsWith('tippy-')) return true
  if (className.startsWith('fa-')) return true
  if (className === 'svg-inline--fa') return true
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

function summarize(items) {
  return {
    total: items.length,
    unused: items.filter(item => item.confidence === 'unused').length,
    possible: items.filter(item => item.confidence === 'possible').length,
    used: items.filter(item => item.confidence === 'used').length,
  }
}

function summarizeByFile(items) {
  const byFile = new Map()
  for (const item of items) {
    const summary = byFile.get(item.file) ?? { total: 0, unused: 0, possible: 0, used: 0 }
    summary.total += 1
    summary[item.confidence] += 1
    byFile.set(item.file, summary)
  }
  return Object.fromEntries([...byFile.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function renderMarkdown(items) {
  const summary = summarize(items)
  const byFile = summarizeByFile(items)
  const lines = [
    '# CE CSS Usage Report',
    '',
    `Generated by \`npm run report:ce-css-usage -- --all --markdown\`.`,
    '',
    '## Summary',
    '',
    `- Total selectors shown: ${summary.total}`,
    `- Used: ${summary.used}`,
    `- Possible/runtime: ${summary.possible}`,
    `- Unused: ${summary.unused}`,
    '',
    '## By File',
    '',
    '| File | Total | Used | Possible | Unused |',
    '| --- | ---: | ---: | ---: | ---: |',
  ]

  for (const [file, fileSummary] of Object.entries(byFile)) {
    lines.push(
      `| ${file} | ${fileSummary.total} | ${fileSummary.used} | ${fileSummary.possible} | ${fileSummary.unused} |`,
    )
  }

  lines.push('', '## Selectors', '')
  for (const item of items) {
    lines.push(`### \`.${item.className}\``)
    lines.push('')
    lines.push(`- Status: \`${item.confidence}\``)
    lines.push(`- Defined: \`${item.file}:${item.line}\``)
    lines.push(`- Reason: ${item.reason}`)
    for (const usage of item.usages) lines.push(`- Used at: \`${usage.file}:${usage.line}\``)
    for (const usage of item.dynamicUsages)
      lines.push(`- Possible dynamic use at: \`${usage.file}:${usage.line}\``)
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

async function writeOutput(content) {
  if (!outFile) {
    console.log(content)
    return
  }
  const target = path.resolve(root, outFile)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, `${content.replace(/\n?$/, '\n')}`)
  console.log(`Wrote CSS usage report: ${toPosix(path.relative(root, target))}`)
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
