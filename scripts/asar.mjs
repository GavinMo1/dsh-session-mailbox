#!/usr/bin/env node
// Read the asar archive that ships with DSH, without extracting it to a tree.
//
// The archive carries the same TypeScript sources the runtime was built from
// (`node_modules/@deepseek-ai/<pkg>/src`), so host behaviour can be read
// instead of guessed. That is what `AGENTS.md` means by "verified against the
// source inside app.asar".
//
//   node scripts/asar.mjs list <regex>          # paths matching the pattern
//   node scripts/asar.mjs cat <path>            # print one file to stdout
//   node scripts/asar.mjs cat <path> <outFile>  # write one file to disk
//
// Typical archive path on Windows:
//   "C:\Program Files\...\resources\app.asar"
// `%DSH_INSTALL_DIR%` points at the directory that holds it in an unpacked
// build, but it only exists inside a tool-execution shell, so pass the path.

import { openSync, readSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const USAGE = `usage:
  node scripts/asar.mjs list <asarPath> <regex> [limit]
  node scripts/asar.mjs cat  <asarPath> <entryPath> [outFile]`

const [mode, asarPath, needle, third] = process.argv.slice(2)
if (mode === undefined || asarPath === undefined || needle === undefined) {
  console.error(USAGE)
  process.exit(2)
}

// --- read the header -------------------------------------------------------
// asar layout: 4-byte size | 4-byte header-pickle size | 4-byte header size |
// 4-byte json length | json | files. Everything else is addressed from
// `base + entry.offset`.
const fd = openSync(asarPath, 'r')
const head = Buffer.alloc(16)
readSync(fd, head, 0, 16, 0)
const headerPickleSize = head.readUInt32LE(4)
const jsonSize = head.readUInt32LE(12)
const json = Buffer.alloc(jsonSize)
readSync(fd, json, 0, jsonSize, 16)
// The pickle pads with NULs; JSON.parse would choke on them.
const header = JSON.parse(json.toString('utf8').replace(/\0+$/, ''))
const base = 8 + headerPickleSize

const entries = []
const walk = (node, prefix) => {
  for (const [name, value] of Object.entries(node.files ?? {})) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    if (value.files !== undefined) walk(value, path)
    else entries.push({ path, offset: Number(value.offset ?? 0), size: value.size ?? 0 })
  }
}
walk(header, '')

// --- list ------------------------------------------------------------------
if (mode === 'list') {
  const re = new RegExp(needle, 'i')
  const limit = third === undefined ? 400 : Number(third)
  const hits = entries.filter((e) => re.test(e.path))
  console.log(JSON.stringify({ total: entries.length, matched: hits.length }))
  for (const hit of hits.slice(0, limit)) console.log(`${String(hit.size).padStart(9)}  ${hit.path}`)
  if (hits.length > limit) console.log(`... ${hits.length - limit} more`)
  process.exit(0)
}

// --- cat -------------------------------------------------------------------
if (mode === 'cat') {
  const entry = entries.find((e) => e.path === needle)
  if (entry === undefined) {
    console.error(`not found: ${needle}`)
    console.error('try: node scripts/asar.mjs list <asarPath> <regex>')
    process.exit(1)
  }
  const buf = Buffer.alloc(entry.size)
  readSync(fd, buf, 0, entry.size, base + entry.offset)
  if (third === undefined) {
    process.stdout.write(buf.toString('utf8'))
  } else {
    mkdirSync(dirname(third), { recursive: true })
    writeFileSync(third, buf)
    console.log(`wrote ${entry.size} bytes -> ${third}`)
  }
  process.exit(0)
}

console.error(USAGE)
process.exit(2)
