// Zero-dependency pure logic for dsh-session-mailbox.
// Only `node:` built-ins are allowed here (currently: create.js uses node:path).

/** Agent status -> the two states the tool surface can express. */
export function pageStatus(status) {
  return status === 'running' ? 'running' : 'inactive'
}

/** Which inbox primitive to use for a target in this state. */
export function primitiveFor(status) {
  return status === 'running' ? 'steer' : 'followup'
}

/**
 * Assign each entry a short `name` that is a suffix of its id.
 * Session ids look like `session-<uuid>`; the prefix is constant, so only the
 * tail discriminates. Base = last 8 chars; within a base group item i gets
 * last (8 + i) chars, and a group containing any id shorter than that
 * degrades to full ids for the whole group.
 */
export function buildAliasTable(entries) {
  const list = Array.isArray(entries) ? entries : []
  const groups = new Map()
  for (const e of list) {
    const base = String(e.id).slice(-8)
    if (!groups.has(base)) groups.set(base, [])
    groups.get(base).push(e)
  }
  const out = []
  for (const group of groups.values()) {
    const sorted = group.slice().sort((a, b) => {
      const x = String(a.id)
      const y = String(b.id)
      if (x < y) return -1
      if (x > y) return 1
      return 0
    })
    let degrade = false
    const suffixes = sorted.map((e, i) => {
      const id = String(e.id)
      if (id.length < 8 + i) degrade = true
      return id.slice(-(8 + i))
    })
    sorted.forEach((e, i) => {
      out.push({ ...e, name: degrade ? String(e.id) : suffixes[i] })
    })
  }
  return out
}

/** Three-state allow list: undefined = allow all, [] = deny all. */
export function decideDelivery(allow, targetId) {
  if (allow === undefined) return { ok: true }
  if (allow.length === 0) return { ok: false, reason: 'denied-all' }
  if (allow.includes(targetId)) return { ok: true }
  return { ok: false, reason: 'denied' }
}

/** UTF-8 byte budget, not UTF-16 code units. */
export function validateMessage(text, maxBytes) {
  if (typeof text !== 'string') return 'empty'
  if (text.trim() === '') return 'empty'
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return 'too-large'
  return undefined
}

/**
 * Resolve a user-supplied address to one entry.
 * Order: exact name, exact id, exact title, unique id suffix, unique title
 * substring. Every ambiguous step fails closed with the candidate names.
 */
export function resolveTarget(table, arg, selfId) {
  const q = (typeof arg === 'string' ? arg : '').trim()
  if (q === '') return { ok: false, reason: 'empty', candidates: [] }
  const rows = Array.isArray(table) ? table : []
  const accept = (hit) => {
    if (selfId !== undefined && selfId !== null && String(hit.id) === String(selfId)) {
      return { ok: false, reason: 'self', candidates: [] }
    }
    return { ok: true, entry: hit }
  }
  const ambiguous = (hits) => ({
    ok: false,
    reason: 'ambiguous',
    candidates: hits.map((e) => e.name).sort(),
  })
  const titled = (e) => typeof e.title === 'string' && e.title !== ''

  const byName = rows.filter((e) => e.name === q)
  if (byName.length === 1) return accept(byName[0])
  if (byName.length > 1) return ambiguous(byName)

  const byId = rows.filter((e) => String(e.id) === q)
  if (byId.length === 1) return accept(byId[0])
  if (byId.length > 1) return ambiguous(byId)

  // Titles are what a user actually knows. They are not unique, so a shared
  // title is refused with candidates rather than guessed.
  const byTitle = rows.filter((e) => titled(e) && e.title === q)
  if (byTitle.length === 1) return accept(byTitle[0])
  if (byTitle.length > 1) return ambiguous(byTitle)

  const bySuffix = rows.filter((e) => String(e.id).endsWith(q))
  if (bySuffix.length === 1) return accept(bySuffix[0])
  if (bySuffix.length > 1) return ambiguous(bySuffix)

  const byTitlePart = rows.filter((e) => titled(e) && e.title.includes(q))
  if (byTitlePart.length === 1) return accept(byTitlePart[0])
  if (byTitlePart.length > 1) return ambiguous(byTitlePart)

  return { ok: false, reason: 'notfound', candidates: [] }
}

/** The delivered text: sender identity plus the sender's words. */
export function messageText(senderName, text) {
  return `Agent ${senderName} sent a message:\n${text}`
}

/**
 * Bound a notice summary the way DSH does (`CONTEXT_SUMMARY_MAX_CHARS` = 120,
 * ellipsized at 119). Mirrored here so the collapsed row reads the same as a
 * host-authored notice.
 */
export const CONTEXT_SUMMARY_MAX_CHARS = 120

/**
 * The one-line account shown on the collapsed context row.
 * Flattened to a single line: the row is one line tall, and a raw newline would
 * otherwise hide everything after it.
 */
export function messageSummary(senderName, text) {
  const line = String(text).replace(/\s+/gu, ' ').trim()
  const full = `${senderName}: ${line}`
  return full.length <= CONTEXT_SUMMARY_MAX_CHARS
    ? full
    : `${full.slice(0, CONTEXT_SUMMARY_MAX_CHARS - 1)}…`
}

/**
 * Message provenance. Text and identity only — no policy, no credentials.
 *
 * `form: 'notice'` rather than `'relay'`, and this is the whole reason the row
 * is readable: Chat renders any non-`user` message as a collapsed context row,
 * and only the `notice` form lets that row carry a `summary`. `relay` has a
 * dedicated body (`RelayBody`, "from session <id>") but its summary slot is
 * hard-coded null, so a relay row reads as nothing but "上下文注入 · session-mailbox"
 * until the reader clicks it. Neither the sender nor the message text is lost:
 * both are in the summary and again in the body text.
 */
export function messageSource(senderId, senderName, text) {
  return {
    kind: 'session-mailbox',
    form: 'notice',
    summary: messageSummary(senderName, text),
    senderSessionId: String(senderId),
  }
}
