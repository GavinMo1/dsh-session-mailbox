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

/**
 * Map one `sessionController.resolveAgent` failure to a stable reason.
 *
 * That call folds every failure into an `{ error }` value whose `code` is one of
 * `session/not-found` / `session/agent-busy` / `session/writer-held` /
 * `gateway/internal`. `session/agent-busy` also covers prompt and continuation
 * failures, so only the `details.reason` that names subagent delivery is read as
 * subagent ownership; anything else stays `internal`. Defined for that one call
 * site only — do not reuse it for other failures.
 */
export function wakeFailureVerdict(error) {
  const code = typeof error === 'object' && error !== null ? error.code : undefined
  const reason = typeof error === 'object' && error !== null ? error.details?.reason : undefined
  const detail = String(error?.message ?? '')
  if (code === 'session/not-found') return { ok: false, reason: 'not-found', detail }
  if (code === 'session/agent-busy' && String(reason ?? '').includes('subagent delivery')) {
    return { ok: false, reason: 'subagent', detail }
  }
  if (code === 'session/writer-held') return { ok: false, reason: 'writer-held', detail }
  return { ok: false, reason: 'internal', detail }
}

/**
 * Admission for a target that is not loaded in this process, before it is woken.
 *
 * The order is fixed: a malformed allow value, then the three-state allow list,
 * then the archived set. Reading the archived set failed (or it is not an array)
 * yields `archived-unreadable` rather than "not archived": delivery fails closed.
 * `allow === undefined` means allow-all, exactly as in {@link decideDelivery}.
 */
export function coldAdmission({ allow, archived, id }) {
  if (allow !== undefined && !Array.isArray(allow)) return 'allow-unreadable'
  const gate = decideDelivery(allow, id)
  if (gate.ok !== true) return gate.reason
  if (!Array.isArray(archived)) return 'archived-unreadable'
  if (archived.map(String).includes(String(id))) return 'archived'
  return 'ok'
}

/** UTF-8 byte budget, not UTF-16 code units. */
export function validateMessage(text, maxBytes) {
  if (typeof text !== 'string') return 'empty'
  if (text.trim() === '') return 'empty'
  if (Buffer.byteLength(text, 'utf8') > maxBytes) return 'too-large'
  return undefined
}

/**
 * Pre-checks for a user-owned session title.
 * Empty and multi-line titles are refused here so the caller gets a clear
 * message; the length cap belongs to the session-title service
 * (`maxTitleBytes`), which rejects an over-long title with its own error.
 */
export function validateTitle(text) {
  if (typeof text !== 'string') return 'empty'
  if (text.trim() === '') return 'empty'
  if (/[\r\n]/.test(text)) return 'multiline'
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
 * Message provenance. Text and identity only — no policy, no credentials.
 *
 * `relay` is the form DSH defines for exactly this: `AgentMessageSource` in
 * dsh-subagent is documented as "a message another agent addressed to this one
 * (`relay` context form)". Do not switch this to `notice` to buy a collapsed-row
 * summary: `notice` means the runtime stating what became of a child, and it
 * would also cost RelayBody's "from session <id>" line. The row being easy to
 * miss is a property of how Chat projects every non-`user` source, not of this
 * form — see the README before "fixing" it.
 */
export function messageSource(senderId) {
  return { kind: 'session-mailbox', form: 'relay', senderSessionId: String(senderId) }
}
