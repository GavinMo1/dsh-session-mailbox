#!/usr/bin/env node
// Read a durable DSH session log: prompts, tool calls with their arguments,
// tool results, and assistant answers. This is the on-disk transcript, not a
// live channel - it works on cold and archived sessions too, and it shows what
// the agent actually did (including which tools it called) rather than only
// what it said.
//
//   node scripts/session-log.mjs <sessionId | path/to/session.v4.jsonl.zstd>
//   node scripts/session-log.mjs <id> --source session-mailbox
//   node scripts/session-log.mjs <id> --tools
//   node scripts/session-log.mjs <id> --answers
//
// Why this exists as a script rather than a one-liner: the file is a series of
// zstd frames concatenated, not one stream. zstdDecompressSync decodes only the
// FIRST frame, which contains a single `{"type":"session",...}` line, so a naive
// read looks like an empty log. The frames have to be walked one by one here.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Byte length of the zstd frame starting at `start`, by walking its block headers. */
function frameLength(buf, start) {
  let pos = start + 4
  const descriptor = buf[pos]
  pos += 1
  const fcsFlag = descriptor >> 6
  const singleSegment = (descriptor >> 5) & 1
  const hasChecksum = (descriptor >> 2) & 1
  const dictFlag = descriptor & 3
  if (!singleSegment) pos += 1 // Window_Descriptor
  pos += [0, 1, 2, 4][dictFlag] // Dictionary_ID
  pos += fcsFlag === 0 ? (singleSegment ? 1 : 0) : [0, 2, 4, 8][fcsFlag] // Frame_Content_Size
  for (;;) {
    const header = buf[pos] | (buf[pos + 1] << 8) | (buf[pos + 2] << 16)
    pos += 3
    const last = header & 1
    const type = (header >> 1) & 3
    const size = header >>> 3
    pos += type === 1 ? 1 : size // RLE blocks carry one byte of payload
    if (last === 1) break
  }
  if (hasChecksum === 1) pos += 4
  return pos - start
}

function readRecords(file) {
  const buf = readFileSync(file)
  const records = []
  let pos = 0
  while (pos + 4 <= buf.length && buf.compare(ZSTD_MAGIC, 0, 4, pos, pos + 4) === 0) {
    const len = frameLength(buf, pos)
    if (!Number.isFinite(len) || len <= 0 || pos + len > buf.length) break
    let chunk
    try {
      chunk = zstdDecompressSync(buf.subarray(pos, pos + len)).toString('utf8')
    } catch {
      pos += len
      continue
    }
    pos += len
    for (const line of chunk.split('\n')) {
      if (line.trim() === '') continue
      try {
        records.push(JSON.parse(line))
      } catch {
        /* a torn trailing line is normal while a session is still writing */
      }
    }
  }
  return records
}

/** Locate `<home>/.dsh/sessions/<encoded-cwd>/<sessionId>/session.v4.jsonl.zstd`. */
function resolveLog(target) {
  if (target.includes('\\') || target.includes('/') || target.endsWith('.zstd')) {
    if (!existsSync(target)) throw new Error(`no such file: ${target}`)
    return target
  }
  const root = join(homedir(), '.dsh', 'sessions')
  if (!existsSync(root)) throw new Error(`no sessions directory: ${root}`)
  const hits = []
  for (const workspace of readdirSync(root, { withFileTypes: true })) {
    if (!workspace.isDirectory()) continue
    const dir = join(root, workspace.name, target)
    const file = join(dir, 'session.v4.jsonl.zstd')
    if (existsSync(file)) hits.push(file)
  }
  if (hits.length === 0) throw new Error(`no session log found for ${target}`)
  if (hits.length > 1) throw new Error(`ambiguous session id ${target}: ${hits.join(', ')}`)
  return hits[0]
}

const textOf = (content) => (Array.isArray(content) ? content : [])
  .filter((part) => part !== null && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string')
  .map((part) => part.text)
  .join('\n')

const clip = (value, max = 400) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text === undefined) return ''
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length} chars]`
}

const [target, ...flags] = process.argv.slice(2)
if (target === undefined) {
  console.error('usage: node scripts/session-log.mjs <sessionId | path> [--tools] [--answers] [--source <kind>] [--all]')
  process.exit(2)
}

const onlyTools = flags.includes('--tools')
const onlyAnswers = flags.includes('--answers')
const showAll = flags.includes('--all')
const sourceIndex = flags.indexOf('--source')
const sourceFilter = sourceIndex === -1 ? undefined : flags[sourceIndex + 1]

const file = resolveLog(target)
const records = readRecords(file)
console.log(`# ${file}`)
console.log(`# ${records.length} records`)

for (const record of records) {
  const data = record.data ?? {}
  const type = record.type

  if (type === 'session') {
    console.log(`\n# session ${data.id ?? record.id}  cwd=${data.cwd ?? record.cwd}`)
    continue
  }

  // `--source` narrows the whole output to records from that source, not just
  // to user messages: asking for `--source session-mailbox` should show the
  // relayed messages and nothing else.
  if (sourceFilter !== undefined && type !== 'user/message') continue

  if (type === 'user/message') {
    const source = data.source?.kind ?? 'unknown'
    if (sourceFilter !== undefined && source !== sourceFilter) continue
    if (onlyTools || onlyAnswers) continue
    const text = textOf(data.content)
    if (text === '') continue
    // System reminders and skill catalogs are noise for this purpose.
    const label = text.startsWith('<system-reminder>') ? 'SYSTEM-REMINDER' : 'USER'
    console.log(`\n[${label} source=${source}]\n${clip(text, showAll ? 100000 : 600)}`)
    continue
  }

  if (type === 'tool/call') {
    if (onlyAnswers) continue
    console.log(`\n[TOOL CALL] ${data.name} ${clip(data.arguments, 400)}`)
    continue
  }

  if (type === 'tool/result') {
    if (onlyAnswers) continue
    const message = data.message ?? {}
    const text = textOf(message.content)
    const error = message.isError === true ? ' ERROR' : ''
    console.log(`[TOOL RESULT${error}] ${clip(text, showAll ? 100000 : 400)}`)
    continue
  }

  if (type === 'assistant/message') {
    if (onlyTools) continue
    const message = data.message ?? {}
    const text = textOf(message.content)
    if (text === '') continue
    console.log(`\n[ASSISTANT]\n${clip(text, showAll ? 100000 : 1200)}`)
    continue
  }
}
