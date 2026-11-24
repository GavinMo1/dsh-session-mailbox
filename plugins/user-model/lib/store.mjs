// Filesystem and git side of the library. Every function takes the library
// root explicitly: nothing here knows whether it was called by the CLI or by
// the plugin, and nothing here reads UM_HOME.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as um from './um.mjs'

const ENTRIES = 'entries'
const PENDING = '.pending'
const ID_RE = /^\d{8}-[a-z][a-z0-9-]{0,40}$/

const entriesDir = (root) => path.join(root, ENTRIES)
const pendingDir = (root) => path.join(root, ENTRIES, PENDING)

const exists = (p) => {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

// `null` means "there is something there but it cannot be listed"; an empty
// array means an empty directory. Collapsing the two would let an unreadable
// entries/ directory read as an empty library and silently answer "no match".
const readdirSafe = (dir) => {
  try {
    return fs.readdirSync(dir).sort()
  } catch (e) {
    if (e && e.code === 'ENOENT') return []
    return null
  }
}

const tryUnlink = (p) => {
  try {
    fs.unlinkSync(p)
  } catch {
    // A tmp that is already gone is the normal case on the success path.
  }
}

const pad = (n) => String(n).padStart(2, '0')

export function localDate(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

export function tomorrow(now = new Date()) {
  return localDate(new Date(now.getTime() + 86400000))
}

export function isoNow(now = new Date()) {
  return now.toISOString().replace(/\.\d+Z$/, 'Z')
}

export function stagedIds(root) {
  return (readdirSafe(pendingDir(root)) ?? [])
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -3))
}

function readEntry(full, name, opts = {}) {
  let text
  try {
    text = fs.readFileSync(full, 'utf8')
  } catch {
    return { ok: false, error: 'parse', detail: 'unreadable' }
  }
  const parsed = um.parseEntry(text, name)
  if (parsed.ok !== true) return parsed
  const verdict = um.validateEntry(parsed.entry, opts)
  if (verdict.ok !== true) return verdict
  return { ok: true, entry: parsed.entry }
}

// Write `text` to `dir/base` without ever overwriting an existing target.
// fs.rename is forbidden here: it silently replaces the destination.
export function land(dir, base, text, onSuccess) {
  const tmp = path.join(dir, base + '.' + process.pid + '-' + Math.random().toString(16).slice(2) + '.tmp')
  const target = path.join(dir, base)
  const entryName = base.replace(/\.md$/, '')
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' })
    try {
      fs.linkSync(tmp, target)
    } catch (e) {
      const code = e && e.code
      if (code === 'EEXIST') return { ok: false, error: 'error: entry exists: ' + entryName }
      if (code === 'EPERM' || code === 'ENOTSUP' || code === 'ENOSYS' || code === 'EXDEV') {
        try {
          fs.copyFileSync(tmp, target, fs.constants.COPYFILE_EXCL)
        } catch (e2) {
          if (e2 && e2.code === 'EEXIST') return { ok: false, error: 'error: entry exists: ' + entryName }
          return { ok: false, error: 'error: cannot land entry: ' + ((e2 && e2.code) || 'unknown') }
        }
      } else {
        return { ok: false, error: 'error: cannot land entry: ' + (code || 'unknown') }
      }
    }
    return onSuccess()
  } catch (e) {
    return { ok: false, error: 'error: cannot write entry: ' + ((e && e.code) || 'unknown') }
  } finally {
    tryUnlink(tmp)
  }
}

function git(root, args) {
  try {
    const out = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { ok: true, out: String(out ?? '') }
  } catch (e) {
    // Git's CRLF warnings would otherwise push the fatal line out of sight.
    const raw = String((e && (e.stderr || e.message)) || 'git failed')
    const reason = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('warning:'))
      .join(' ')
    return { ok: false, reason: reason === '' ? raw.trim() : reason }
  }
}

function commitOne(root, id) {
  const rel = ENTRIES + '/' + id + '.md'
  const add = git(root, ['add', '--', rel])
  if (add.ok !== true) return add
  return git(root, ['commit', '-m', 'entry: ' + id, '--', rel])
}

// ---- search -------------------------------------------------------------

export function search(root, keywords) {
  const tokens = um.tokenize(keywords.join(' '))
  if (tokens.length === 0) return { ok: false, error: 'error: no keywords' }

  const dir = entriesDir(root)
  const listing = exists(dir) ? readdirSafe(dir) : null
  const library = listing === null ? 'missing' : 'ok'
  const staged = stagedIds(root).length
  const skipped = []
  const entries = []

  if (listing !== null) {
    for (const name of listing) {
      const full = path.join(dir, name)
      let isDir = false
      try {
        isDir = fs.statSync(full).isDirectory()
      } catch {
        skipped.push(name)
        continue
      }
      if (isDir) {
        if (name !== PENDING) skipped.push(name)
        continue
      }
      if (name.endsWith('.tmp')) continue
      if (!name.endsWith('.md')) {
        skipped.push(name)
        continue
      }
      const read = readEntry(full, name)
      if (read.ok !== true) {
        skipped.push(name)
        continue
      }
      entries.push(read.entry)
    }
  }

  const ranked = um.rank(entries, tokens)
  const rows = ranked.slice(0, um.MAX_RESULTS).map((row) => row.entry)
  return {
    ok: true,
    lines: um.formatSearch({ root, library, staged, rows, total: ranked.length, skipped }),
  }
}

// ---- append -------------------------------------------------------------

export function append(root, opts = {}) {
  const slug = String(opts.slug ?? '')
  if (!um.SLUG_RE.test(slug)) return { ok: false, error: 'error: bad slug: ' + slug }
  const kind = String(opts.kind ?? '')
  if (!um.KINDS.includes(kind)) return { ok: false, error: 'error: bad kind: ' + kind }
  const title = String(opts.title ?? '')
  const titleVerdict = um.validateTitle(title)
  if (titleVerdict.ok !== true) return { ok: false, error: 'error: bad title: ' + titleVerdict.detail }
  const body = um.normalizeNewlines(opts.body ?? '').replace(/\n+$/, '')
  const bodyVerdict = um.validateBody(body)
  if (bodyVerdict.ok !== true) return { ok: false, error: 'error: bad body: ' + bodyVerdict.detail }

  const day = opts.date === undefined ? localDate() : String(opts.date)
  // Date.parse accepts 2026-02-31 and rolls it forward, so compare the
  // round trip instead of trusting the parse.
  const rollover = new Date(day + 'T00:00:00Z')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(rollover.getTime()) ||
    rollover.toISOString().slice(0, 10) !== day
  ) {
    return { ok: false, error: 'error: bad date: ' + day }
  }
  if (day > tomorrow()) return { ok: false, error: 'error: bad date: ' + day }

  const id = um.entryId(day, slug)
  fs.mkdirSync(pendingDir(root), { recursive: true })
  fs.mkdirSync(entriesDir(root), { recursive: true })
  if (exists(path.join(entriesDir(root), id + '.md')) || exists(path.join(pendingDir(root), id + '.md'))) {
    return { ok: false, error: 'error: entry exists: ' + id }
  }

  // Only this id's leftovers: another id's tmp may belong to a live writer.
  for (const name of readdirSafe(pendingDir(root)) ?? []) {
    if (name.startsWith(id + '.md.') && name.endsWith('.tmp')) tryUnlink(path.join(pendingDir(root), name))
  }

  const entry = {
    schema: '1',
    id,
    date: day,
    kind,
    stagedOn: isoNow(),
    approvedBy: '',
    approvedOn: '',
    title,
    body,
  }
  const landed = land(pendingDir(root), id + '.md', um.renderEntry(entry), () => ({ ok: true }))
  if (landed.ok !== true) return landed
  return { ok: true, id, lines: ['staged: ' + id] }
}

// ---- approve ------------------------------------------------------------

// Only the two approval fields change; every other byte, body included, is
// carried over untouched so the reader sees the text the user agreed to.
function patchApproval(text, approvedBy, approvedOn) {
  const lines = um.normalizeNewlines(text).split('\n')
  const end = lines.indexOf('---', 1)
  const limit = end === -1 ? lines.length : end
  for (let i = 1; i < limit; i++) {
    if (lines[i].startsWith('approved-by:')) lines[i] = 'approved-by: ' + approvedBy
    else if (lines[i].startsWith('approved-on:')) lines[i] = 'approved-on: ' + approvedOn
  }
  return lines.join('\n')
}

export function approve(root, id, approvedBy) {
  const by = String(approvedBy ?? '').trim()
  if (by === '') return { ok: false, error: 'error: approved-by is required' }
  // approved-by is written straight into a single front-matter line: a newline
  // would split the front matter and leave an unparseable entry behind a
  // success message.
  if (/[\r\n]/.test(by)) return { ok: false, error: 'error: bad approved-by: contains a newline' }
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown pending: ' + key }

  fs.mkdirSync(pendingDir(root), { recursive: true })
  fs.mkdirSync(entriesDir(root), { recursive: true })

  const pendingPath = path.join(pendingDir(root), key + '.md')
  if (!exists(pendingPath)) return { ok: false, error: 'error: unknown pending: ' + key }

  const text = fs.readFileSync(pendingPath, 'utf8')
  const parsed = um.parseEntry(text, key + '.md')
  if (parsed.ok !== true) return { ok: false, error: 'error: bad pending: ' + parsed.detail }
  const verdict = um.validateEntry(parsed.entry, { pending: true })
  if (verdict.ok !== true) return { ok: false, error: 'error: bad pending: ' + verdict.detail }

  const target = path.join(entriesDir(root), key + '.md')
  if (exists(target)) return { ok: false, error: 'error: entry exists: ' + key }

  const landed = land(entriesDir(root), key + '.md', patchApproval(text, by, isoNow()), () => ({ ok: true }))
  if (landed.ok !== true) return landed
  // A landed entry that cannot be parsed would count as readable while being
  // invisible to `search`; refuse to report success for it.
  const reread = um.parseEntry(fs.readFileSync(target, 'utf8'), key + '.md')
  if (reread.ok !== true) return { ok: false, error: 'error: bad pending: ' + reread.detail }
  const reverdict = um.validateEntry(reread.entry, {})
  if (reverdict.ok !== true) return { ok: false, error: 'error: bad pending: ' + reverdict.detail }
  tryUnlink(pendingPath)

  // The entry is on disk and readable at this point. A git failure must not
  // undo that: it is reported, and `sync` retries the commit later.
  const committed = commitOne(root, key)
  if (committed.ok !== true) return { ok: false, error: 'error: commit failed: ' + committed.reason }
  const pushed = git(root, ['push'])
  if (pushed.ok !== true) return { ok: false, error: 'error: push failed: ' + pushed.reason }
  return { ok: true, id: key, lines: ['approved: ' + key] }
}

// ---- sync ---------------------------------------------------------------

export function sync(root) {
  const status = git(root, ['status', '--porcelain'])
  if (status.ok !== true) return { ok: false, error: 'error: commit failed: ' + status.reason }
  const paths = status.out
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line !== '')
    .map((line) => {
      const rest = line.slice(3)
      const arrow = rest.indexOf(' -> ')
      return arrow === -1 ? rest : rest.slice(arrow + 4)
    })
    .filter((p) => p.startsWith(ENTRIES + '/') && p.endsWith('.md'))

  let committed = 0
  for (const rel of paths) {
    const id = path.basename(rel, '.md')
    const result = commitOne(root, id)
    if (result.ok !== true) return { ok: false, error: 'error: commit failed: ' + result.reason }
    committed++
  }
  // Push even when nothing was committed: a previous `approve` may have
  // committed successfully and then failed to push, which leaves a clean tree
  // and an unpushed commit. That is exactly the case sync exists to repair.
  const pushed = git(root, ['push'])
  if (pushed.ok !== true) return { ok: false, error: 'error: push failed: ' + pushed.reason }
  return { ok: true, lines: ['synced: ' + committed] }
}

// ---- check --------------------------------------------------------------

export function check(root) {
  const lines = []
  const scan = (dir, pending) => {
    const listing = readdirSafe(dir)
    if (listing === null) {
      lines.push('unreadable: ' + path.basename(dir))
      return
    }
    for (const name of listing) {
      const full = path.join(dir, name)
      let isDir = false
      try {
        isDir = fs.statSync(full).isDirectory()
      } catch {
        lines.push('stray file: ' + name)
        continue
      }
      if (isDir) {
        if (!(pending === false && name === PENDING)) lines.push('stray file: ' + name)
        continue
      }
      if (name.endsWith('.tmp')) {
        lines.push('stale tmp: ' + name)
        continue
      }
      if (!name.endsWith('.md')) {
        lines.push('stray file: ' + name)
        continue
      }
      const read = readEntry(full, name, { pending, today: tomorrow() })
      if (read.ok !== true) {
        lines.push(read.error + ': ' + name)
      }
    }
  }
  if (exists(entriesDir(root))) scan(entriesDir(root), false)
  if (exists(pendingDir(root))) scan(pendingDir(root), true)
  return { ok: lines.length === 0, lines }
}

// ---- status -------------------------------------------------------------

export function status(root) {
  const listing = exists(entriesDir(root)) ? readdirSafe(entriesDir(root)) : null
  const library = listing === null ? 'missing' : 'ok'
  const approved = listing === null ? 0 : listing.filter((name) => name.endsWith('.md')).length
  const staged = stagedIds(root)
  return {
    ok: true,
    lines: [
      'library: ' + library,
      'root: ' + root,
      'entries: ' + approved,
      'staged: ' + staged.length,
      ...staged.map((id) => 'staged id: ' + id),
    ],
  }
}
