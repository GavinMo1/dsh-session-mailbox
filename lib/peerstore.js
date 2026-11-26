// The shared peer file: one edge per send, readable from either end.
//
// Three rules the display depends on:
//
//   1. READS NEVER WRITE. No mkdir, no prune, no touch, no repair of a damaged
//      file. Reading is what `list_sessions` does on every call; a read that also
//      wrote would let a renderer erase the evidence a peer is looking for.
//   2. AN UNREADABLE FILE MEANS "NO RECORD", not "no reply". The caller gets a
//      kind it can tell apart, and treats everything except `ok`/`recovered` as
//      silence.
//   3. WRITES ARE ATOMIC. Bytes go to a sibling temp file and are renamed over
//      the target, so a crash mid-write cannot leave half a document where a
//      whole one belongs. This mirrors the pattern already used by
//      `dsh-feishu/lib/jsonstore.js`; the backup copy is the only extra, and a
//      damaged primary falls back to it exactly once.
//
// Why a file at all, when the plugin is a single instance in the Host process:
// the record must survive a restart, several Host processes can share one user,
// and a read must answer from current facts rather than from whatever this
// process happened to remember.
//
// Only `node:` built-ins are allowed here.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PEER_LIMIT, pruneEntries, recordSend, sanitizeEntries } from './peers.js'

/** Directory name under the per-user state base. */
export const STATE_DIR_NAME = 'dsh-session-mailbox'

/** Environment override, so tests never touch the real state directory. */
export const STATE_ENV = 'SESSION_MAILBOX_STATE'

/** Upper bound on how many edges the file may describe. */
export const FILE_LIMIT = PEER_LIMIT

/**
 * The per-user base directory for one platform.
 * `platform`/`env` are parameters rather than `process.*` so every branch is
 * exercisable on one machine.
 */
export function stateBaseFor(platform, env) {
  if (platform === 'win32') {
    const base = env?.LOCALAPPDATA
    if (typeof base === 'string' && base !== '') return base
    return path.join(os.homedir(), 'AppData', 'Local')
  }
  if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support')
  const xdg = env?.XDG_STATE_HOME
  if (typeof xdg === 'string' && xdg !== '') return xdg
  return path.join(os.homedir(), '.local', 'state')
}

/** The mailbox state directory. */
export function stateDir(env = process.env) {
  const override = env?.[STATE_ENV]
  if (typeof override === 'string' && override !== '') return override
  return path.join(stateBaseFor(process.platform, env), STATE_DIR_NAME)
}

/** The peer file and its recovery copy. */
export function peerFile(env = process.env) {
  const file = path.join(stateDir(env), 'peers.json')
  return { file, backup: `${file}.bak` }
}

/** Read outcomes. `absent` and `corrupt` stay separate on purpose. */
export const OK = 'ok'
export const ABSENT = 'absent'
export const CORRUPT = 'corrupt'
export const RECOVERED = 'recovered'

/** Is this parsed document the shape we wrote? */
export function validateDocument(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'not an object'
  if (value.v !== 1) return `unsupported version ${JSON.stringify(value.v)}`
  if (value.entries === null || typeof value.entries !== 'object' || Array.isArray(value.entries)) {
    return '"entries" must be an object'
  }
  return null
}

function readOne(file) {
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return { kind: ABSENT }
    return { kind: CORRUPT, detail: `unreadable: ${String(error?.message ?? error)}` }
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { kind: CORRUPT, detail: `not json: ${String(error?.message ?? error)}` }
  }
  const problem = validateDocument(parsed)
  if (problem !== null) return { kind: CORRUPT, detail: `invalid shape: ${problem}` }
  return { kind: OK, entries: sanitizeEntries(parsed.entries) }
}

/**
 * Read the edge table. PURELY READ-ONLY: never creates the directory, never
 * prunes, never repairs a damaged file in place.
 * @returns {{kind: string, entries: object, detail?: string, source?: string}}
 */
export function readPeers(env = process.env) {
  const { file, backup } = peerFile(env)
  const primary = readOne(file)
  if (primary.kind === OK) return { ...primary, source: file }
  if (primary.kind === ABSENT) {
    // The backup exists only because a write once succeeded, so its presence with
    // the primary gone means the primary was removed, not that it never existed.
    const secondary = readOne(backup)
    if (secondary.kind === OK) {
      return { kind: RECOVERED, entries: secondary.entries, source: backup, detail: 'primary absent, backup used' }
    }
    return { kind: ABSENT, entries: {} }
  }
  const secondary = readOne(backup)
  if (secondary.kind === OK) {
    return { kind: RECOVERED, entries: secondary.entries, source: backup, detail: primary.detail }
  }
  return { kind: CORRUPT, entries: {}, detail: primary.detail }
}

/**
 * Write the table atomically: bytes to a sibling temp file, then rename over the
 * target. `mkdir` happens here and only here — a write may create its own home.
 */
export function writePeers(entries, env = process.env) {
  const { file, backup } = peerFile(env)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const document = { v: 1, entries }
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  if (fs.existsSync(file)) {
    try {
      fs.copyFileSync(file, backup)
    } catch {
      /* the previous bytes are a convenience, not a precondition */
    }
  }
  try {
    fs.renameSync(tmp, file)
  } catch (error) {
    try {
      fs.unlinkSync(tmp)
    } catch {
      /* best effort */
    }
    throw error
  }
}

/**
 * Record one send: read, merge the edge, prune, write.
 *
 * This is the ONLY write path. Pruning lives here so the bound is on the file,
 * which is what keeps a mailbox that has talked to a thousand sessions cheap to
 * open.
 * @returns {{dropped: number, entries: object}}
 */
export function recordSendEdge({ from, to, at }, env = process.env) {
  if (typeof from !== 'string' || from === '') throw new Error('recordSendEdge needs a sender session id')
  if (typeof to !== 'string' || to === '') throw new Error('recordSendEdge needs a recipient session id')
  if (from === to) throw new Error('recordSendEdge refuses a self edge')
  const current = readPeers(env)
  const recorded = recordSend(current.entries, from, to, at)
  const { kept, dropped } = pruneEntries(recorded, FILE_LIMIT)
  writePeers(kept, env)
  return { dropped, entries: kept }
}
