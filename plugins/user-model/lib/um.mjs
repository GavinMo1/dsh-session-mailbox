// Pure logic for the user-model library. No fs, no process, no imports.
// Everything here is deterministic so it can be unit-tested without a repository.

export const KINDS = ['fact', 'decision']
export const FIELD_ORDER = ['schema', 'id', 'date', 'kind', 'staged-on', 'approved-by', 'approved-on']
export const TITLE_MAX = 60
export const BODY_MAX = 400
export const MAX_RESULTS = 3
export const SLUG_RE = /^[a-z][a-z0-9-]{0,40}$/

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u{20000}-\u{2FA1F}]/u
const ASCII_WORD_RE = /[A-Za-z0-9#+._-]/

export const length = (s) => Array.from(String(s ?? '')).length

export function normalizeNewlines(text) {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

// 1. CJK runs are segmented away from everything else; inside an ASCII run
//    `#`, `+`, `.`, `-`, `_` stay inside the word.
// 2. An ASCII run of length >= 1 is lowercased and kept whole.
// 3. A CJK run of length 1 keeps the character; length >= 2 yields every
//    adjacent bigram, so 深色 matches 偏好深色主题 without a dictionary.
// 4. Duplicates are removed. An empty result means "no keywords", decided by callers.
export function tokenize(query) {
  // NFKC folds fullwidth forms (ａ, １) onto ASCII, so a fullwidth IME slip is
  // still searchable; iteration is by code point, so Ext-B ideographs survive.
  const chars = Array.from(String(query ?? '').normalize('NFKC'))
  const out = []
  const seen = new Set()
  const push = (t) => {
    if (t === '' || seen.has(t)) return
    seen.add(t)
    out.push(t)
  }
  let i = 0
  while (i < chars.length) {
    const c = chars[i]
    if (CJK_RE.test(c)) {
      let j = i
      while (j < chars.length && CJK_RE.test(chars[j])) j++
      const run = chars.slice(i, j)
      if (run.length === 1) push(run[0])
      else for (let k = 0; k + 1 < run.length; k++) push(run[k] + run[k + 1])
      i = j
    } else if (ASCII_WORD_RE.test(c)) {
      let j = i
      while (j < chars.length && ASCII_WORD_RE.test(chars[j])) j++
      push(chars.slice(i, j).join('').toLowerCase())
      i = j
    } else {
      i++
    }
  }
  return out
}

// The separator matters: without it a title ending in 深 and a body starting
// with 色 would match the bigram 深色, which never appeared in the entry.
export function matchScore(entry, tokens) {
  const hay = (String(entry.title ?? '') + '\n' + String(entry.body ?? '')).toLowerCase()
  let score = 0
  for (const t of tokens) if (hay.includes(t)) score++
  return score
}

export function entryId(date, slug) {
  return String(date).replace(/-/g, '') + '-' + String(slug)
}

export function idPrefixOf(fileName) {
  const base = String(fileName).endsWith('.md') ? String(fileName).slice(0, -3) : String(fileName)
  const at = base.indexOf('-')
  return at === -1 ? base : base.slice(0, at)
}

// Returns { ok: true, entry } or { ok: false, error, detail }.
// `error` is the short code the `check` command prints; `detail` is for humans.
export function parseEntry(text, fileName) {
  const src = normalizeNewlines(text)
  const id = String(fileName).replace(/\.md$/, '')
  const lines = src.split('\n')
  if (lines[0] !== '---') return { ok: false, error: 'parse', detail: 'missing front-matter' }
  const end = lines.indexOf('---', 1)
  if (end === -1) return { ok: false, error: 'parse', detail: 'unterminated front-matter' }

  const fm = {}
  for (const line of lines.slice(1, end)) {
    const at = line.indexOf(':')
    if (at === -1) return { ok: false, error: 'parse', detail: 'front-matter line without a colon' }
    const key = line.slice(0, at).trim()
    const value = line.slice(at + 1).trim()
    if (!FIELD_ORDER.includes(key)) return { ok: false, error: 'parse', detail: 'unknown field: ' + key }
    if (Object.prototype.hasOwnProperty.call(fm, key)) return { ok: false, error: 'parse', detail: 'duplicate field: ' + key }
    fm[key] = value
  }
  for (const f of FIELD_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(fm, f)) return { ok: false, error: 'parse', detail: 'missing field: ' + f }
  }

  const titleLine = lines[end + 1]
  if (titleLine === undefined || !titleLine.startsWith('title: ')) {
    return { ok: false, error: 'parse', detail: 'missing title line' }
  }
  const title = titleLine.slice('title: '.length)
  const body = lines.slice(end + 2).join('\n').replace(/\n+$/, '')

  const entry = {
    schema: fm.schema,
    id: fm.id,
    date: fm.date,
    kind: fm.kind,
    stagedOn: fm['staged-on'],
    approvedBy: fm['approved-by'],
    approvedOn: fm['approved-on'],
    title,
    body,
    fileName: String(fileName),
  }
  if (entry.id !== id) return { ok: false, error: 'id mismatch', detail: 'id ' + entry.id + ' != file name ' + id, entry }
  if (!DATE_RE.test(entry.date)) return { ok: false, error: 'parse', detail: 'bad date: ' + entry.date, entry }
  if (idPrefixOf(fileName) !== entry.date.replace(/-/g, '')) {
    return { ok: false, error: 'id mismatch', detail: 'file name prefix does not match date ' + entry.date, entry }
  }
  return { ok: true, entry }
}

// opts.today  : 'YYYY-MM-DD', enables the `future date` verdict (check only)
// opts.pending: true for entries under entries/.pending (approval fields may be empty)
export function validateEntry(entry, opts = {}) {
  if (entry.schema !== '1') return { ok: false, error: 'schema', detail: 'schema is ' + entry.schema }
  if (!KINDS.includes(entry.kind)) return { ok: false, error: 'bad kind', detail: 'kind is ' + entry.kind }
  const titleVerdict = validateTitle(entry.title)
  if (titleVerdict.ok !== true) return { ok: false, error: 'bad title', detail: titleVerdict.detail }
  const bodyVerdict = validateBody(entry.body)
  if (bodyVerdict.ok !== true) return { ok: false, error: 'bad body', detail: bodyVerdict.detail }
  if (!ISO_UTC_RE.test(entry.stagedOn)) return { ok: false, error: 'bad time', detail: 'staged-on is ' + JSON.stringify(entry.stagedOn) }
  if (opts.pending !== true) {
    if (entry.approvedBy === '') return { ok: false, error: 'unapproved', detail: 'approved-by is empty' }
    if (!ISO_UTC_RE.test(entry.approvedOn)) return { ok: false, error: 'bad time', detail: 'approved-on is ' + JSON.stringify(entry.approvedOn) }
  } else if (entry.approvedOn !== '' && !ISO_UTC_RE.test(entry.approvedOn)) {
    return { ok: false, error: 'bad time', detail: 'approved-on is ' + JSON.stringify(entry.approvedOn) }
  }
  if (typeof opts.today === 'string' && opts.today !== '' && entry.date > opts.today) {
    return { ok: false, error: 'future date', detail: 'date ' + entry.date + ' is later than ' + opts.today }
  }
  return { ok: true }
}

export function validateTitle(title) {
  const t = String(title ?? '')
  if (t === '') return { ok: false, detail: 'title is empty' }
  if (/[\r\n]/.test(t)) return { ok: false, detail: 'title contains a newline' }
  if (t.includes('|')) return { ok: false, detail: 'title contains |' }
  if (length(t) > TITLE_MAX) return { ok: false, detail: 'title is ' + length(t) + ' characters, max ' + TITLE_MAX }
  return { ok: true }
}

export function validateBody(body) {
  const raw = normalizeNewlines(body)
  const b = raw.replace(/\n+$/, '')
  if (b === '') return { ok: false, detail: 'body is empty' }
  if (b.includes('|')) return { ok: false, detail: 'body contains |' }
  if (b.split('\n').some((line) => line === '---')) return { ok: false, detail: 'body contains a line equal to ---' }
  if (length(b) > BODY_MAX) return { ok: false, detail: 'body is ' + length(b) + ' characters, max ' + BODY_MAX }
  return { ok: true }
}

export function renderEntry(entry) {
  const head = [
    '---',
    'schema: ' + entry.schema,
    'id: ' + entry.id,
    'date: ' + entry.date,
    'kind: ' + entry.kind,
    'staged-on: ' + entry.stagedOn,
    'approved-by: ' + entry.approvedBy,
    'approved-on: ' + entry.approvedOn,
    '---',
    'title: ' + entry.title,
  ]
  return head.join('\n') + '\n' + entry.body + '\n'
}

// Newest date wins, match score breaks ties. `sort` is stable, so an entry that
// scores the same as another keeps the order it was scanned in.
export function rank(entries, tokens) {
  return entries
    .map((entry) => ({ entry, score: matchScore(entry, tokens) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => (a.entry.date === b.entry.date ? b.score - a.score : (a.entry.date < b.entry.date ? 1 : -1)))
}

export function dataLine(entry) {
  const body = normalizeNewlines(entry.body).split('\n').join(' ')
  return [entry.id, entry.date, entry.kind, entry.title, body].join(' | ')
}

// `total` is the number of matching entries, not the number of rows printed:
// the reader must be able to tell "only one entry" from "more exist, older".
export function formatSearch({ root, library, staged, rows, total, skipped }) {
  const lines = ['# library: ' + library, '# root: ' + root, '# staged: ' + staged]
  if (rows.length === 0) lines.push('# no match')
  else for (const entry of rows) lines.push(dataLine(entry))
  lines.push('# total: ' + total)
  for (const name of skipped) lines.push('# skipped: ' + name)
  return lines
}
