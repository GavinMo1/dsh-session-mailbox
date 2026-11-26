import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  PEER_LIMIT,
  recordSend,
  lookupPair,
  replyState,
  replySuffix,
  ageText,
  pruneEntries,
  sanitizeEntries,
  edgeKey,
  parseEdgeKey,
} from '../lib/peers.js'
import {
  ABSENT,
  CORRUPT,
  OK,
  peerFile,
  readPeers,
  recordSendEdge,
  stateDir,
  writePeers,
} from '../lib/peerstore.js'

// The four boundaries this feature is judged on:
//   a session nobody messaged renders nothing; a missing or unreadable file is
//   "no record", never "no reply"; the record survives a restart; and reading
//   never writes. Time comes from the message, not from the file's mtime.

const A = 'session-aaaaaaaa-1111'
const B = 'session-bbbbbbbb-2222'
const C = 'session-cccccccc-3333'

/** A throwaway state directory, and the env override pointed at it. */
function withTempState(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-peers-'))
  const previous = process.env.SESSION_MAILBOX_STATE
  process.env.SESSION_MAILBOX_STATE = root
  t.after(() => {
    if (previous === undefined) delete process.env.SESSION_MAILBOX_STATE
    else process.env.SESSION_MAILBOX_STATE = previous
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

test('edge-key-roundtrip', () => {
  console.log('CASE edge-key-roundtrip')
  assert.strictEqual(edgeKey(A, B), `${A}|${B}`)
  assert.deepStrictEqual(parseEdgeKey(edgeKey(A, B)), { from: A, to: B })
  // Junk is junk: no invented sender, no half-parsed pair.
  assert.strictEqual(parseEdgeKey('nopipe'), undefined)
  assert.strictEqual(parseEdgeKey(`${A}|${B}|${C}`), undefined)
  assert.strictEqual(parseEdgeKey('|x'), undefined)
  assert.strictEqual(parseEdgeKey(42), undefined)
})

test('no-record-renders-nothing', () => {
  console.log('CASE no-record-renders-nothing')
  // The session the user opened themselves: no edge, no suffix, and above all
  // NOT "未回信".
  assert.deepStrictEqual(lookupPair({}, A, B), {})
  const state = replyState(lookupPair({}, A, B))
  assert.deepStrictEqual(state, { stage: 'none' })
  assert.strictEqual(replySuffix(state, Date.now()), '')
})

test('one-write-point-both-views', () => {
  console.log('CASE one-write-point-both-views')
  // A single recorded send is readable from BOTH ends by direction alone: the
  // sender sees "outbound to B", B sees "inbound from A". No second write.
  const sentAt = 1_700_000_000_000
  const table = recordSend({}, A, B, sentAt)
  assert.deepStrictEqual(lookupPair(table, A, B), { out: sentAt })
  assert.deepStrictEqual(lookupPair(table, B, A), { in: sentAt })
  // From A's point of view: sent, nothing back yet.
  assert.deepStrictEqual(replyState(lookupPair(table, A, B)), { stage: 'awaiting', since: sentAt })
  // From B's point of view there is no outbound and an inbound: that IS a reply.
  assert.deepStrictEqual(replyState(lookupPair(table, B, A)), { stage: 'replied', since: sentAt })
})

test('reply-after-send-is-replied', () => {
  console.log('CASE reply-after-send-is-replied')
  const sentAt = 1_700_000_000_000
  const replyAt = sentAt + 12 * 60_000
  let table = recordSend({}, A, B, sentAt)
  table = recordSend(table, B, A, replyAt)
  const state = replyState(lookupPair(table, A, B))
  assert.deepStrictEqual(state, { stage: 'replied', since: replyAt })
  assert.strictEqual(replySuffix(state, replyAt + 60_000), ' · 已回信（1 分钟前）')
})

test('send-after-reply-goes-back-to-awaiting', () => {
  console.log('CASE send-after-reply-goes-back-to-awaiting')
  // The later send is the one that matters: what was answered is no longer the
  // latest thing said.
  const first = 1_700_000_000_000
  const replyAt = first + 60_000
  const secondSend = replyAt + 60_000
  let table = recordSend({}, A, B, first)
  table = recordSend(table, B, A, replyAt)
  table = recordSend(table, A, B, secondSend)
  const state = replyState(lookupPair(table, A, B))
  assert.deepStrictEqual(state, { stage: 'awaiting', since: secondSend })
  assert.strictEqual(replySuffix(state, secondSend + 40 * 60_000), ' · 自上次派发（40 分钟）未回信')
})

test('tie-counts-as-replied', () => {
  console.log('CASE tie-counts-as-replied')
  // Both edges stamped with one instant is the echo of a send that came back;
  // calling that "未回信" would be the wrong way to be strict.
  const at = 1_700_000_000_000
  let table = recordSend({}, A, B, at)
  table = recordSend(table, B, A, at)
  assert.strictEqual(replyState(lookupPair(table, A, B)).stage, 'replied')
})

test('burstable-sends-keep-the-latest', () => {
  console.log('CASE burstable-sends-keep-the-latest')
  // Three sends in one tick and an older instant arriving late: latest wins, no
  // de-duplication, no merging, no second record.
  const base = 1_700_000_000_000
  let table = recordSend({}, A, B, base)
  table = recordSend(table, A, B, base + 1)
  table = recordSend(table, A, B, base + 2)
  table = recordSend(table, A, B, base - 5)
  assert.deepStrictEqual(table, { [edgeKey(A, B)]: base + 2 })
  assert.strictEqual(Object.keys(table).length, 1)
})

test('self-edge-is-not-a-conversation', () => {
  console.log('CASE self-edge-is-not-a-conversation')
  const table = recordSend({}, A, A, 1_700_000_000_000)
  assert.deepStrictEqual(table, {})
})

test('junk-instants-and-junk-rows-are-dropped-individually', () => {
  console.log('CASE junk-instants-and-junk-rows-are-dropped-individually')
  const good = edgeKey(A, B)
  const table = recordSend({ [good]: 1_700_000_000_000 }, A, B, Number.NaN)
  assert.deepStrictEqual(table, { [good]: 1_700_000_000_000 }, 'a NaN must not replace a known instant')
  const cleaned = sanitizeEntries({
    [good]: 1_700_000_000_000,
    'no-separator': 1,
    [edgeKey(B, C)]: 'not a number',
    [edgeKey(A, C)]: -1,
  })
  assert.deepStrictEqual(cleaned, { [good]: 1_700_000_000_000 }, 'one bad row must not cost the others')
})

test('prune-keeps-the-most-recent', () => {
  console.log('CASE prune-keeps-the-most-recent')
  const entries = {}
  for (let i = 0; i < PEER_LIMIT + 5; i += 1) {
    entries[edgeKey(A, `session-peer-${i}`)] = 1_000_000 + i
  }
  const { kept, dropped } = pruneEntries(entries, PEER_LIMIT)
  assert.strictEqual(Object.keys(kept).length, PEER_LIMIT)
  assert.strictEqual(dropped, 5)
  assert.ok(!(edgeKey(A, 'session-peer-0') in kept), 'the oldest edge is the one evicted')
  assert.ok(edgeKey(A, `session-peer-${PEER_LIMIT + 4}`) in kept)
})

test('age-text-units', () => {
  console.log('CASE age-text-units')
  const now = 1_700_000_000_000
  assert.strictEqual(ageText(now - 30_000, now), '不到 1 分钟')
  assert.strictEqual(ageText(now - 12 * 60_000, now), '12 分钟')
  assert.strictEqual(ageText(now - 59 * 60_000, now), '59 分钟')
  assert.strictEqual(ageText(now - 3 * 3_600_000, now), '3 小时')
  assert.strictEqual(ageText(now - 50 * 3_600_000, now), '2 天')
  // A clock that went backwards must not print a negative age.
  assert.strictEqual(ageText(now + 60_000, now), '不到 1 分钟')
  assert.strictEqual(ageText(undefined, now), '未知时长')
})

test('store-survives-a-restart', (t) => {
  console.log('CASE store-survives-a-restart')
  withTempState(t)
  const at = 1_700_000_000_000
  recordSendEdge({ from: A, to: B, at })
  // A fresh read is what a restarted Host does: nothing in memory, file on disk.
  const result = readPeers()
  assert.strictEqual(result.kind, OK)
  assert.deepStrictEqual(lookupPair(result.entries, A, B), { out: at })
})

test('store-absent-means-no-record', (t) => {
  console.log('CASE store-absent-means-no-record')
  const root = withTempState(t)
  const result = readPeers()
  assert.strictEqual(result.kind, ABSENT)
  assert.deepStrictEqual(result.entries, {})
  // The display consequence: no suffix at all, not "未回信".
  assert.strictEqual(replySuffix(replyState(lookupPair(result.entries, A, B)), Date.now()), '')
  // And reading must not have created the directory.
  assert.strictEqual(fs.existsSync(path.join(root, 'peers.json')), false)
})

test('store-corrupt-is-read-not-repaired', (t) => {
  console.log('CASE store-corrupt-is-read-not-repaired')
  const root = withTempState(t)
  fs.mkdirSync(root, { recursive: true })
  const { file, backup } = peerFile()
  fs.writeFileSync(file, 'this is not json', 'utf8')
  const before = fs.readFileSync(file, 'utf8')
  const result = readPeers()
  assert.strictEqual(result.kind, CORRUPT)
  assert.deepStrictEqual(result.entries, {})
  // Reading is pure: the damaged bytes stay exactly as they were, and no backup
  // or temp file appears next to them.
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before)
  assert.strictEqual(fs.existsSync(backup), false)
  assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.includes('.tmp-')), [])
})

test('store-read-does-not-touch-mtime', (t) => {
  console.log('CASE store-read-does-not-touch-mtime')
  withTempState(t)
  const at = 1_700_000_000_000
  recordSendEdge({ from: A, to: B, at })
  const { file } = peerFile()
  // Pretend the file was written long ago; the answer must still come from the
  // recorded instant, not from the file's mtime.
  const old = new Date('2020-01-01T00:00:00Z')
  fs.utimesSync(file, old, old)
  const mtimeBefore = fs.statSync(file).mtimeMs
  const result = readPeers()
  assert.strictEqual(fs.statSync(file).mtimeMs, mtimeBefore, 'a read must not rewrite the file')
  const state = replyState(lookupPair(result.entries, A, B))
  assert.strictEqual(state.since, at)
  // 2026-11-14 is years after the fake mtime, so the age is days, not seconds.
  assert.match(replySuffix(state, Date.parse('2026-11-14T22:13:20Z')), /（\d+ 天）未回信/u)
})

test('store-bound-is-enforced-on-write-only', (t) => {
  console.log('CASE store-bound-is-enforced-on-write-only')
  withTempState(t)
  const now = Date.now()
  const entries = {}
  for (let i = 0; i < PEER_LIMIT + 12; i += 1) entries[edgeKey(A, `session-bulk-${i}`)] = now - i
  writePeers(entries)
  // The file itself keeps more than the limit; the write path is what prunes.
  const persisted = readPeers()
  assert.strictEqual(persisted.kind, OK)
  assert.strictEqual(Object.keys(persisted.entries).length, PEER_LIMIT + 12)
  // One more send trims it back to the bound.
  recordSendEdge({ from: A, to: B, at: now + 1 })
  const trimmed = readPeers()
  assert.strictEqual(Object.keys(trimmed.entries).length, PEER_LIMIT)
  assert.ok(edgeKey(A, B) in trimmed.entries, 'the newest edge survives the trim')
})

test('store-rejects-unusable-pairs', (t) => {
  console.log('CASE store-rejects-unusable-pairs')
  withTempState(t)
  assert.throws(() => recordSendEdge({ from: '', to: B, at: 1 }), /sender session id/)
  assert.throws(() => recordSendEdge({ from: A, to: '', at: 1 }), /recipient session id/)
  assert.throws(() => recordSendEdge({ from: A, to: A, at: 1 }), /self edge/)
})

test('state-root-honours-the-env-override', (t) => {
  console.log('CASE state-root-honours-the-env-override')
  const root = withTempState(t)
  assert.strictEqual(stateDir(), root)
  assert.strictEqual(peerFile().file, path.join(root, 'peers.json'))
})
