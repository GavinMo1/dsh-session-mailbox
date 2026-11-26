// Zero-dependency pure logic for the derived reply state.
//
// ONE WRITE POINT, TWO VIEWS. Every message that crosses this plugin is sent by
// `send_session_message`, so the sender records one edge `from -> to` and that is
// all the bookkeeping there is. Both questions are answered from those edges by
// direction alone:
//
//   last outbound to X = edge me -> X        (I sent it something)
//   last inbound from X = edge X  -> me      (it sent me something)
//
// In particular "did it write back" is `edge X -> me exists`, which is a fact
// about structure rather than a reading of the message text. Nothing here parses
// `Agent <name> sent a message:` or any other prefix: a format that has to be
// recognised by string shape is one silent change away from being wrong.
//
// A pair with no edges has NO record, and no record is not a negative answer —
// a session the user opened themselves must never be labelled as owing a reply.
//
// Only `node:` built-ins are allowed here.

/** How many edges one mailbox keeps before evicting the least recently used. */
export const PEER_LIMIT = 200

/** Separator between sender and recipient in an edge key. Session ids are `session-<uuid>`, so `|` cannot appear. */
export const KEY_SEPARATOR = '|'

/** The key for one direction of a pair. */
export function edgeKey(from, to) {
  return `${String(from)}${KEY_SEPARATOR}${String(to)}`
}

/**
 * Split an edge key back into its two ids, or `undefined` when it is not one.
 * Exactly one separator, both sides non-empty; anything else is junk and is
 * dropped rather than given an invented sender.
 */
export function parseEdgeKey(key) {
  if (typeof key !== 'string') return undefined
  const parts = key.split(KEY_SEPARATOR)
  if (parts.length !== 2) return undefined
  const [from, to] = parts
  if (from === '' || to === '') return undefined
  return { from, to }
}

/** A usable millisecond instant, or undefined. Anything else is not a time. */
function instant(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value)
}

/**
 * Record one send, returning a NEW table.
 *
 * Only moves forward: an older instant arriving late must not rewind what we
 * already know, and a burst of sends in one tick simply keeps the latest — no
 * de-duplication, no merging, nothing to get wrong.
 *
 * A self edge is refused by returning the table unchanged: a session that sends
 * to itself is not a conversation this feature has anything to say about.
 */
export function recordSend(entries, from, to, at) {
  const next = { ...(entries ?? {}) }
  const sender = typeof from === 'string' ? from : String(from ?? '')
  const recipient = typeof to === 'string' ? to : String(to ?? '')
  if (sender === '' || recipient === '' || sender === recipient) return next
  const time = instant(at)
  if (time === undefined) return next
  const key = edgeKey(sender, recipient)
  const previous = instant(next[key])
  if (previous !== undefined && previous >= time) return next
  next[key] = time
  return next
}

/**
 * Both directions of one pair, as the caller sees them.
 * @returns {{out?: number, in?: number}} absent sides stay absent.
 */
export function lookupPair(entries, owner, peer) {
  const table = entries !== null && typeof entries === 'object' ? entries : {}
  const out = instant(table[edgeKey(owner, peer)])
  const inbound = instant(table[edgeKey(peer, owner)])
  return {
    ...(out === undefined ? {} : { out }),
    ...(inbound === undefined ? {} : { in: inbound }),
  }
}

/**
 * The one decision this feature exists for.
 *
 * `out` is when I last sent this peer a message, `in` when it last wrote to me.
 * No record at all → `none` (render nothing). A tie goes to `replied`: two edges
 * stamped with one instant is the echo of a send that already came back.
 * @returns { stage: 'none' } | { stage: 'replied' | 'awaiting', since: number }
 */
export function replyState(record) {
  const out = instant(record?.out)
  const inbound = instant(record?.in)
  if (out === undefined && inbound === undefined) return { stage: 'none' }
  if (inbound !== undefined && (out === undefined || inbound >= out)) {
    return { stage: 'replied', since: inbound }
  }
  return { stage: 'awaiting', since: out }
}

/**
 * How long ago, in the coarsest unit that still says something.
 * `now` is a parameter so the wording is testable without a clock.
 */
export function ageText(since, now) {
  const from = instant(since)
  const to = instant(now)
  if (from === undefined || to === undefined) return '未知时长'
  const minutes = Math.floor(Math.max(0, to - from) / 60000)
  if (minutes < 1) return '不到 1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} 小时`
  return `${Math.floor(hours / 24)} 天`
}

/**
 * The row suffix, or the empty string when there is nothing to say.
 * Kept in one place so the two shapes cannot drift apart.
 */
export function replySuffix(state, now) {
  if (state === undefined || state === null || state.stage === 'none') return ''
  if (state.stage === 'replied') return ` · 已回信（${ageText(state.since, now)}前）`
  return ` · 自上次派发（${ageText(state.since, now)}）未回信`
}

/**
 * Keep the `limit` most recently used edges.
 *
 * Called on WRITE only. Pruning during a read would make reading a mutation, and
 * a reader running at the wrong moment would delete the evidence another session
 * is about to look for.
 * @returns {{kept: object, dropped: number}}
 */
export function pruneEntries(entries, limit = PEER_LIMIT) {
  const all = entries !== null && typeof entries === 'object' ? entries : {}
  const keys = Object.keys(all)
  if (keys.length <= limit) return { kept: { ...all }, dropped: 0 }
  const ranked = keys
    .map((key) => ({ key, used: instant(all[key]) ?? 0 }))
    .sort((a, b) => (b.used - a.used) || (a.key < b.key ? -1 : 1))
  const kept = {}
  for (const { key } of ranked.slice(0, limit)) kept[key] = all[key]
  return { kept, dropped: keys.length - limit }
}

/** Drop junk edges individually: one bad row must not cost the rest their record. */
export function sanitizeEntries(value) {
  const source = value !== null && typeof value === 'object' ? value : {}
  const out = {}
  for (const [key, at] of Object.entries(source)) {
    if (parseEdgeKey(key) === undefined) continue
    const time = instant(at)
    if (time === undefined) continue
    out[key] = time
  }
  return out
}
