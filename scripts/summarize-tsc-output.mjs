#!/usr/bin/env node
/**
 * Summarise `tsc` / `vue-tsc --pretty false` output by error code and by file so a large
 * first-run error list can be triaged.
 *
 *   npx vue-tsc --noEmit -p apps/clearideas-ce/tsconfig.web.json --pretty false > vue-tsc.log
 *   node scripts/summarize-tsc-output.mjs vue-tsc.log
 */
import fs from 'node:fs'

const input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8')
const pattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/
const byCode = new Map()
const byFile = new Map()
const samples = new Map()
let total = 0

for (const raw of input.split(/\r?\n/)) {
  const line = raw.replace(/^\uFEFF/, '')
  const match = pattern.exec(line)
  if (!match) continue
  const [, file, , , code, message] = match
  total += 1
  byCode.set(code, (byCode.get(code) ?? 0) + 1)
  byFile.set(file, (byFile.get(file) ?? 0) + 1)
  if (!samples.has(code)) samples.set(code, `${file}: ${message.slice(0, 140)}`)
}

console.log(`Total errors: ${total}\n`)
console.log('By error code:')
for (const [code, count] of [...byCode].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(8)} ${String(count).padStart(5)}  e.g. ${samples.get(code)}`)
}
console.log('\nTop files:')
for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(count).padStart(5)}  ${file}`)
}
