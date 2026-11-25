// Filesystem and git side of the library. Every function takes the library
// root explicitly: nothing here knows whether it was called by the CLI or by
// the plugin, and nothing here reads UM_HOME.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import * as um from './um.mjs'

const ENTRIES = 'entries'
const PENDING = '.pending'
const RETIRED = '.retired'
const ID_RE = /^\d{8}-[a-z][a-z0-9-]{0,40}$/

const entriesDir = (root) => path.join(root, ENTRIES)
const pendingDir = (root) => path.join(root, ENTRIES, PENDING)
const retiredDir = (root) => path.join(root, ENTRIES, RETIRED)

// The two sub-directories of entries/ that are states rather than entries.
const SUBDIRS = [PENDING, RETIRED]

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

// One directory of entries, newest date first.
// opts.pending is forwarded to the validators: an entry under .pending/ is
// allowed to have empty approval fields, one under entries/ or .retired/ is not.
function scanEntries(dir, opts = {}) {
  const listing = exists(dir) ? readdirSafe(dir) : []
  if (listing === null) return { ok: false, error: 'unreadable: ' + path.basename(dir) }
  const entries = []
  const skipped = []
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
      // .pending/ and .retired/ are states, not entries; anything else is stray.
      if (!SUBDIRS.includes(name)) skipped.push(name)
      continue
    }
    if (name.endsWith('.tmp')) continue
    if (!name.endsWith('.md')) {
      skipped.push(name)
      continue
    }
    const read = readEntry(full, name, opts)
    if (read.ok !== true) {
      skipped.push(name)
      continue
    }
    // A staged entry is carried in the same list as an approved one, flagged, so
    // a reader can tell what is not published yet without a second tool call.
    if (opts.pending === true) read.entry.pending = true
    entries.push(read.entry)
  }
  entries.sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1)))
  return { ok: true, entries, skipped }
}

// A library that has been cloned but never written to has no entries/ directory
// at all: git does not track empty directories. Keying the verdict off entries/
// therefore reported such a library as "missing", which the agents are told to
// read as "not synced on this machine" — a broken library and an empty one must
// not be the same answer. The root is what distinguishes them.
function libraryVerdict(root) {
  return exists(root) ? 'ok' : 'missing'
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

// The one place rename is legitimate: the destination is a file that was just
// read and re-validated, so replacing it is the intent, and rename is what makes
// the replacement atomic instead of truncate-then-write.
function replaceText(target, text) {
  const tmp = target + '.' + process.pid + '-' + Math.random().toString(16).slice(2) + '.tmp'
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx' })
  } catch (e) {
    tryUnlink(tmp)
    return { ok: false, error: 'error: cannot write entry: ' + ((e && e.code) || 'unknown') }
  }
  try {
    fs.renameSync(tmp, target)
    return { ok: true }
  } catch (e) {
    tryUnlink(tmp)
    return { ok: false, error: 'error: cannot write entry: ' + ((e && e.code) || 'unknown') }
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

// Stage and commit exactly the paths given, then push. `--` keeps a path that
// looks like a revision from being read as one; a path that was deleted is
// staged as a deletion, which is why the caller must pass the old name too.
function commitPaths(root, rels, message) {
  const add = git(root, ['add', '--', ...rels])
  if (add.ok !== true) return { ok: false, error: 'error: commit failed: ' + add.reason }
  const commit = git(root, ['commit', '-m', message, '--', ...rels])
  if (commit.ok !== true) return { ok: false, error: 'error: commit failed: ' + commit.reason }
  return { ok: true }
}

function commitAndPush(root, rels, message) {
  const committed = commitPaths(root, rels, message)
  if (committed.ok !== true) return committed
  const pushed = git(root, ['push'])
  if (pushed.ok !== true) return { ok: false, error: 'error: push failed: ' + pushed.reason }
  return { ok: true }
}

const relOf = (id, dir) => (dir === undefined ? ENTRIES + '/' + id + '.md' : ENTRIES + '/' + dir + '/' + id + '.md')

// ---- search -------------------------------------------------------------

export function search(root, keywords) {
  const tokens = um.tokenize(keywords.join(' '))
  if (tokens.length === 0) return { ok: false, error: 'error: no keywords' }

  const approved = scanEntries(entriesDir(root))
  const pending = scanEntries(pendingDir(root), { pending: true })
  const library = libraryVerdict(root)
  // Counted from the parsed entries, not from the file listing: a staged entry
  // that cannot be read is reported under "# skipped:" instead of being counted
  // as a staged memory the reader can rely on.
  const staged = pending.ok === true ? pending.entries.length : stagedIds(root).length
  const skipped = []
  for (const part of [approved, pending]) {
    if (part.ok !== true) skipped.push(String(part.error).replace(/^unreadable: /, '') + '/')
    else skipped.push(...part.skipped)
  }
  // Staged entries are searchable on purpose: `append` stages without pushing,
  // so a search that only saw entries/ would let the same fact be recorded twice.
  const entries = []
  if (approved.ok === true) entries.push(...approved.entries)
  if (pending.ok === true) entries.push(...pending.entries)

  const ranked = um.rank(entries, tokens)
  const rows = ranked.slice(0, um.MAX_RESULTS).map((row) => row.entry)
  return {
    ok: true,
    lines: um.formatSearch({ root, library, staged, rows, total: ranked.length, skipped }),
  }
}

// ---- list / show --------------------------------------------------------

// Everything in the library, by state. Used by `um list` and by the page; the
// agent never sees this, which is why it is not a fourth tool.
export function listAll(root) {
  const approved = scanEntries(entriesDir(root))
  const pending = scanEntries(pendingDir(root), { pending: true })
  const retired = scanEntries(retiredDir(root))
  const skipped = []
  for (const part of [approved, pending, retired]) {
    if (part.ok !== true) skipped.push(part.error.replace(/^unreadable: /, '') + '/')
    else skipped.push(...part.skipped)
  }
  return {
    ok: true,
    library: libraryVerdict(root),
    root,
    approved: approved.ok === true ? approved.entries : [],
    staged: pending.ok === true ? pending.entries : [],
    retired: retired.ok === true ? retired.entries : [],
    skipped,
  }
}

export function show(root, id) {
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown entry: ' + key }
  const places = [[entriesDir(root), {}], [pendingDir(root), { pending: true }], [retiredDir(root), {}]]
  for (const [dir, opts] of places) {
    const full = path.join(dir, key + '.md')
    if (!exists(full)) continue
    const read = readEntry(full, key + '.md', opts)
    if (read.ok !== true) return { ok: false, error: 'error: bad entry: ' + (read.detail ?? read.error) }
    return { ok: true, entry: read.entry }
  }
  return { ok: false, error: 'error: unknown entry: ' + key }
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

// approved-by is written straight into a single front-matter line: a newline
// would split the front matter and leave an unparseable entry behind a success
// message. Validated once, for both the single-entry and the batch path.
function approvalBy(value) {
  const by = String(value ?? '').trim()
  if (by === '') return { ok: false, error: 'error: approved-by is required' }
  if (/[\r\n]/.test(by)) return { ok: false, error: 'error: bad approved-by: contains a newline' }
  return { ok: true, by }
}

// Land one staged entry into entries/: approval stamped, every other byte carried
// over, the .pending copy removed. No git here on purpose — `flush` lands a whole
// batch and only then commits and pushes once.
function landPending(root, id, by) {
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
  return { ok: true, id: key }
}

// Single-entry path: land, commit that one entry, push. Kept for a caller that
// really does want one entry published now; the batch path is `flush`.
export function approve(root, id, approvedBy) {
  const check = approvalBy(approvedBy)
  if (check.ok !== true) return check
  const landed = landPending(root, id, check.by)
  if (landed.ok !== true) return landed

  // The entry is on disk and readable at this point. A git failure must not
  // undo that: it is reported, and `sync` retries the commit later.
  const committed = commitAndPush(root, [relOf(landed.id)], 'entry: ' + landed.id)
  if (committed.ok !== true) return committed
  return { ok: true, id: landed.id, lines: ['approved: ' + landed.id] }
}

// ---- flush --------------------------------------------------------------

// Approve every staged entry, then commit the batch together and push once. This
// is what `append` used to do per entry: the push is a network round trip and a
// remote commit per recorded fact, which is noise for a library that grows a few
// entries a day. `append` now only stages; `flush` publishes a batch.
export function flush(root, approvedBy) {
  const check = approvalBy(approvedBy)
  if (check.ok !== true) return check

  const ids = stagedIds(root)
  if (ids.length === 0) return { ok: true, lines: ['nothing staged'], landed: [], failed: [] }

  const landed = []
  const failed = []
  for (const id of ids) {
    const result = landPending(root, id, check.by)
    if (result.ok === true) landed.push(id)
    else failed.push(id + ': ' + String(result.error ?? 'unknown').replace(/^error: /, ''))
  }

  // One commit for the whole batch, then one push. Landing already succeeded, so
  // a git failure never loses an entry: it is reported and `sync` finishes it.
  if (landed.length > 0) {
    const committed = commitPaths(root, landed.map((id) => relOf(id)), 'entries: ' + landed.join(' '))
    if (committed.ok !== true) {
      return { ok: false, error: committed.error + ' (landed ' + landed.length + ', run `um sync` to finish)', landed, failed }
    }
    const pushed = git(root, ['push'])
    if (pushed.ok !== true) {
      return { ok: false, error: 'error: push failed: ' + pushed.reason + ' (landed ' + landed.length + ', run `um sync` to push)', landed, failed }
    }
  }

  const lines = ['flushed: ' + landed.length + (landed.length === 0 ? '' : ' (' + landed.join(', ') + ')')]
  for (const line of failed) lines.push('left staged: ' + line)
  if (failed.length > 0) {
    return {
      ok: false,
      error: 'error: ' + lines.join('; ') + ' (fix the cause, then `um flush` again)',
      landed,
      failed,
    }
  }
  return { ok: true, lines, landed, failed }
}

// ---- edit ---------------------------------------------------------------

// Rewrites title and body of an existing entry, leaving its front matter — and
// so its date, kind and approval — untouched. The old text is never lost: it is
// in the previous commit, which is why `history` exists.
export function edit(root, id, opts = {}) {
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown entry: ' + key }
  const full = path.join(entriesDir(root), key + '.md')
  if (!exists(full)) return { ok: false, error: 'error: unknown entry: ' + key }

  const current = readEntry(full, key + '.md')
  if (current.ok !== true) return { ok: false, error: 'error: bad entry: ' + (current.detail ?? current.error) }

  const title = opts.title === undefined ? current.entry.title : String(opts.title)
  const body = opts.body === undefined
    ? current.entry.body
    : um.normalizeNewlines(opts.body).replace(/\n+$/, '')
  if (title === current.entry.title && body === current.entry.body) {
    return { ok: true, id: key, lines: ['unchanged: ' + key] }
  }
  const titleVerdict = um.validateTitle(title)
  if (titleVerdict.ok !== true) return { ok: false, error: 'error: bad title: ' + titleVerdict.detail }
  const bodyVerdict = um.validateBody(body)
  if (bodyVerdict.ok !== true) return { ok: false, error: 'error: bad body: ' + bodyVerdict.detail }

  const next = { ...current.entry, title, body }
  const rewritten = replaceText(full, um.renderEntry(next))
  if (rewritten.ok !== true) return rewritten
  // Re-read: an entry that no longer parses is worse than an old one.
  const after = readEntry(full, key + '.md')
  if (after.ok !== true) return { ok: false, error: 'error: bad entry after write: ' + (after.detail ?? after.error) }

  const changed = []
  if (title !== current.entry.title) changed.push('title')
  if (body !== current.entry.body) changed.push('body')
  const committed = commitAndPush(root, [relOf(key)], 'edit: ' + key + ' (' + changed.join(', ') + ')')
  if (committed.ok !== true) return committed
  return { ok: true, id: key, lines: ['edited: ' + key] }
}

// ---- retire / restore ---------------------------------------------------

const reasonOf = (reason) => {
  const r = um.normalizeNewlines(reason ?? '').replace(/\s+/g, ' ').trim()
  return r === '' ? '' : ' — ' + r.slice(0, 120)
}

// Deleting an entry means moving it out of the set `search` reads. It is not a
// hard delete: the file stays in the repository, so the decision to drop it is
// itself part of the history, and `restore` can undo the mistake.
export function retire(root, id, reason) {
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown entry: ' + key }
  const from = path.join(entriesDir(root), key + '.md')
  if (!exists(from)) {
    if (exists(path.join(retiredDir(root), key + '.md'))) {
      return { ok: false, error: 'error: already retired: ' + key }
    }
    return { ok: false, error: 'error: unknown entry: ' + key }
  }
  fs.mkdirSync(retiredDir(root), { recursive: true })
  const to = path.join(retiredDir(root), key + '.md')
  if (exists(to)) return { ok: false, error: 'error: entry exists: ' + key }

  try {
    fs.renameSync(from, to)
  } catch (e) {
    return { ok: false, error: 'error: cannot retire: ' + ((e && e.code) || 'unknown') }
  }
  const committed = commitAndPush(root, [relOf(key), relOf(key, RETIRED)], 'retire: ' + key + reasonOf(reason))
  if (committed.ok !== true) return committed
  return { ok: true, id: key, lines: ['retired: ' + key] }
}

export function restore(root, id) {
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown entry: ' + key }
  const from = path.join(retiredDir(root), key + '.md')
  if (!exists(from)) return { ok: false, error: 'error: unknown retired: ' + key }
  fs.mkdirSync(entriesDir(root), { recursive: true })
  const to = path.join(entriesDir(root), key + '.md')
  if (exists(to)) return { ok: false, error: 'error: entry exists: ' + key }

  try {
    fs.renameSync(from, to)
  } catch (e) {
    return { ok: false, error: 'error: cannot restore: ' + ((e && e.code) || 'unknown') }
  }
  const committed = commitAndPush(root, [relOf(key), relOf(key, RETIRED)], 'restore: ' + key)
  if (committed.ok !== true) return committed
  return { ok: true, id: key, lines: ['restored: ' + key] }
}

// ---- history ------------------------------------------------------------

export function history(root, id) {
  const key = String(id ?? '')
  if (!ID_RE.test(key)) return { ok: false, error: 'error: unknown entry: ' + key }
  const rels = [relOf(key), relOf(key, PENDING), relOf(key, RETIRED)]
  const log = git(root, ['log', '--date=short', '--pretty=format:%h %ad %s', '--', ...rels])
  if (log.ok !== true) return { ok: false, error: 'error: git log failed: ' + log.reason }
  const lines = log.out.split('\n').map((l) => l.trim()).filter((l) => l !== '')
  return { ok: true, id: key, lines: lines.length === 0 ? ['(no commits)'] : lines }
}

// ---- dirty --------------------------------------------------------------

// How many paths `sync` would still have to commit. The page shows it because a
// failed push leaves the entry readable while the repository quietly diverges.
export function dirtyCount(root) {
  const status = git(root, ['status', '--porcelain'])
  if (status.ok !== true) return 0
  return status.out.split('\n').filter((line) => line.trim() !== '').length
}

// ---- sync ---------------------------------------------------------------

export function sync(root) {
  const status = git(root, ['status', '--porcelain'])
  if (status.ok !== true) return { ok: false, error: 'error: commit failed: ' + status.reason }

  // Group the changed paths by entry id instead of assuming one path per id:
  // a retire shows up as a deletion plus an addition, and passing only the old
  // name would make `git add` fail on a pathspec that no longer exists.
  const groups = new Map()
  for (const line of status.out.split('\n')) {
    const trimmed = line.replace(/\s+$/, '')
    if (trimmed === '') continue
    const rest = trimmed.slice(3)
    const arrow = rest.indexOf(' -> ')
    const rel = arrow === -1 ? rest : rest.slice(arrow + 4)
    if (!rel.startsWith(ENTRIES + '/') || !rel.endsWith('.md')) continue
    const id = path.basename(rel, '.md')
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(rel)
  }

  let committed = 0
  for (const [id, rels] of groups) {
    // Commit only here; the push happens once, below, so a mid-run push failure
    // cannot leave half the entries committed and reported as uncommitted.
    const result = commitPaths(root, rels, 'entry: ' + id)
    if (result.ok !== true) return result
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
        if (!SUBDIRS.includes(name)) lines.push('stray file: ' + name)
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
  if (exists(retiredDir(root))) scan(retiredDir(root), false)
  return { ok: lines.length === 0, lines }
}

// ---- status -------------------------------------------------------------

export function status(root) {
  const scanned = scanEntries(entriesDir(root))
  const approved = scanned.ok === true ? scanned.entries.length : 0
  const retired = scanEntries(retiredDir(root))
  const staged = stagedIds(root)
  return {
    ok: true,
    lines: [
      'library: ' + libraryVerdict(root),
      'root: ' + root,
      'entries: ' + approved,
      'staged: ' + staged.length,
      'retired: ' + (retired.ok === true ? retired.entries.length : 0),
      ...staged.map((id) => 'staged id: ' + id),
    ],
  }
}
