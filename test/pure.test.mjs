import test from 'node:test'
import assert from 'node:assert'
import {
  pageStatus,
  primitiveFor,
  buildAliasTable,
  decideDelivery,
  validateMessage,
  validateTitle,
  resolveTarget,
  messageText,
  messageSource,
  senderTitle,
  SENDER_TITLE_LIMIT,
  wakeFailureVerdict,
  coldAdmission,
} from '../lib/pure.js'

// 44 characters, last 8 all distinct
const A = 'session-00000000-0000-4000-8000-aaaa1111aaaa' // last 8 = 1111aaaa
const B = 'session-00000000-0000-4000-8000-aaaa1111aabb' // last 8 = 1111aabb
const C = 'session-00000000-0000-4000-8000-aaaa1111cccc' // last 8 = 1111cccc
// 44 characters, same last 8 as A (CASE 4 / CASE 7)
const D = 'session-11111111-0000-4000-8000-bbbb1111aaaa' // last 8 = 1111aaaa
// Short-id fixtures, CASE 5 only: same base (all end 12345678), lengths 8 / 9 / 9
const X = '12345678'
const Y = 'a12345678'
const Z = 'b12345678'

const row = (id) => ({ id, status: 'inactive', createdAt: 0 })
const table = (ids) => buildAliasTable(ids.map(row))

test('validate-empty', () => {
  console.log('CASE validate-empty')
  assert.strictEqual(validateMessage('   ', 65536), 'empty')
  assert.strictEqual(validateMessage(undefined, 65536), 'empty')
})

test('validate-bytes', () => {
  console.log('CASE validate-bytes')
  // 30000 code units but 90000 UTF-8 bytes: only a byte budget rejects it
  assert.strictEqual(validateMessage('汉'.repeat(30000), 65536), 'too-large')
  assert.strictEqual(validateMessage('x'.repeat(65536), 65536), undefined)
})

test('alias-suffix', () => {
  console.log('CASE alias-suffix')
  const t = table([A, B])
  const a = t.find((e) => e.id === A)
  const b = t.find((e) => e.id === B)
  assert.strictEqual(a.name.length, 8)
  assert.strictEqual(b.name.length, 8)
  assert.strictEqual(a.name, A.slice(-8))
  assert.strictEqual(b.name, B.slice(-8))
})

test('alias-collision', () => {
  console.log('CASE alias-collision')
  const t = table([A, D])
  const a = t.find((e) => e.id === A)
  const d = t.find((e) => e.id === D)
  assert.strictEqual(a.name.length, 8)
  assert.strictEqual(d.name.length, 9)
  assert.notStrictEqual(a.name, d.name)
  assert.ok(A.endsWith(a.name))
  assert.ok(D.endsWith(d.name))
})

test('alias-short', () => {
  console.log('CASE alias-short')
  const t = table([X, Y, Z])
  const names = t.map((e) => e.name)
  assert.strictEqual(new Set(names).size, 3)
  for (const e of t) assert.ok(String(e.id).endsWith(e.name), `${e.name} is not a suffix of ${e.id}`)
  const sorted = t.slice().sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0))
  sorted.forEach((e, i) => {
    if (String(e.id).length < 8 + i) assert.strictEqual(e.name, String(e.id))
  })
})

test('resolve-exact', () => {
  console.log('CASE resolve-exact')
  const t = table([A, B, C])
  assert.strictEqual(resolveTarget(t, A.slice(-8), null).entry.id, A)
  assert.strictEqual(resolveTarget(t, A, null).entry.id, A)
  assert.strictEqual(resolveTarget(t, A.slice(-6), null).entry.id, A)
})

test('resolve-ambiguous', () => {
  console.log('CASE resolve-ambiguous')
  const t = table([A, D])
  const r = resolveTarget(t, '11aaaa', null)
  assert.strictEqual(r.reason, 'ambiguous')
  assert.strictEqual(r.candidates.length, 2)
})

test('resolve-empty-self', () => {
  console.log('CASE resolve-empty-self')
  const t = table([A, B])
  assert.strictEqual(resolveTarget(t, '', null).reason, 'empty')
  assert.strictEqual(resolveTarget(t, '   ', null).reason, 'empty')
  assert.strictEqual(resolveTarget(t, A.slice(-8), A).reason, 'self')
})

test('resolve-notfound', () => {
  console.log('CASE resolve-notfound')
  const r = resolveTarget(table([A, B]), 'zzzzzzzz', null)
  assert.strictEqual(r.reason, 'notfound')
  assert.deepStrictEqual(r.candidates, [])
})

test('status', () => {
  console.log('CASE status')
  assert.strictEqual(pageStatus('idle'), 'inactive')
  assert.strictEqual(pageStatus('running'), 'running')
  assert.strictEqual(primitiveFor('idle'), 'followup')
  assert.strictEqual(primitiveFor('running'), 'steer')
})

test('allow', () => {
  console.log('CASE allow')
  assert.strictEqual(decideDelivery(undefined, 'x').ok, true)
  assert.deepStrictEqual(decideDelivery([], 'x'), { ok: false, reason: 'denied-all' })
  assert.deepStrictEqual(decideDelivery(['y'], 'x'), { ok: false, reason: 'denied' })
  assert.strictEqual(decideDelivery(['x'], 'x').ok, true)
})

test('text-source', () => {
  console.log('CASE text-source')
  assert.strictEqual(messageText('aaaa1111', 'ping'), 'Agent aaaa1111 sent a message:\nping')
  const src = messageSource('s-1')
  assert.deepStrictEqual(Object.keys(src), ['kind', 'form', 'senderSessionId'])
  // `relay` is the form DSH defines for a message another agent addressed to
  // this one. Switching it to `notice` would only buy a collapsed-row summary.
  assert.strictEqual(src.form, 'relay')
  assert.strictEqual(src.senderSessionId, 's-1')
})

// ---- sender title in the message header (0.9.2) ----------------------------
// The host parses the first line with /^Agent (\S+) sent a message:/u, so the
// title rides on line 2 and line 1 stays byte-identical to 0.9.1.
const HOST_PREFIX = /^Agent (\S+) sent a message:/u

test('header-titled', () => {
  console.log('CASE header-titled')
  const out = messageText('a1b2c3d4', 'ping', 'release')
  assert.strictEqual(out, 'Agent a1b2c3d4 sent a message:\n来自「release」(a1b2c3d4)\nping')
  const lines = out.split('\n')
  // line 1 is the prefix the host parses, and its capture is still the short name
  const m = HOST_PREFIX.exec(lines[0])
  assert.notStrictEqual(m, null)
  assert.strictEqual(m[1], 'a1b2c3d4')
  // the readable identity is on line 2: title plus the short name
  assert.ok(lines[1].includes('release'), lines[1])
  assert.ok(lines[1].includes('a1b2c3d4'), lines[1])
  // a title with spaces must not disturb the parsed prefix
  const spaced = messageText('a1b2c3d4', 'ping', 'release lead session')
  assert.notStrictEqual(HOST_PREFIX.exec(spaced.split('\n')[0]), null)
  assert.ok(spaced.split('\n')[1].includes('release lead session'))
})

test('header-untitled', () => {
  console.log('CASE header-untitled')
  // exactly today's shape: no second line at all
  for (const title of [undefined, null, '', '   ', '\n', 42, {}]) {
    assert.strictEqual(messageText('a1b2c3d4', 'ping', title), 'Agent a1b2c3d4 sent a message:\nping')
    assert.strictEqual(messageText('a1b2c3d4', 'ping', title).split('\n').length, 2)
  }
  assert.strictEqual(senderTitle(undefined), undefined)
  assert.strictEqual(senderTitle('  \t '), undefined)
})

test('header-title-sanitize', () => {
  console.log('CASE header-title-sanitize')
  // newlines and tabs cannot break the header into extra lines
  assert.strictEqual(senderTitle('a\nb'), 'a b')
  assert.strictEqual(senderTitle('a\r\nb\tc'), 'a b c')
  assert.strictEqual(senderTitle('  pad  '), 'pad')
  const multi = messageText('a1b2c3d4', 'ping', 'line1\nline2')
  assert.strictEqual(multi.split('\n')[1], '来自「line1 line2」(a1b2c3d4)')
  // over-long titles are cut to SENDER_TITLE_LIMIT code points, ellipsis included
  const long = '长'.repeat(200)
  const cut = senderTitle(long)
  assert.strictEqual(Array.from(cut).length, SENDER_TITLE_LIMIT)
  assert.ok(cut.endsWith('…'))
  assert.ok(long.startsWith(cut.slice(0, -1)))
  // a title inside the limit is returned untouched
  assert.strictEqual(senderTitle('长'.repeat(SENDER_TITLE_LIMIT)), '长'.repeat(SENDER_TITLE_LIMIT))
  assert.strictEqual(senderTitle('长'.repeat(SENDER_TITLE_LIMIT - 1)), '长'.repeat(SENDER_TITLE_LIMIT - 1))
  // code points, not UTF-16 code units: a surrogate pair is never split
  const emoji = '🐳'.repeat(60)
  const cutEmoji = senderTitle(emoji)
  assert.strictEqual(Array.from(cutEmoji).length, SENDER_TITLE_LIMIT)
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(cutEmoji), 'dangling high surrogate')
  assert.ok(!/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(cutEmoji), 'dangling low surrogate')
})

test('header-body-verbatim', () => {
  console.log('CASE header-body-verbatim')
  // The body is appended as given: its own lines, leading spaces, markdown and
  // an `Agent ... sent a message:`-looking first line all survive untouched.
  const body = 'Agent zzzz9999 sent a message:\n  indented\n\n```js\n1\n```\n  '
  const out = messageText('a1b2c3d4', body, 'release')
  assert.strictEqual(out.split('\n').slice(2).join('\n'), body)
  assert.strictEqual(out.slice(0, out.length - body.length), 'Agent a1b2c3d4 sent a message:\n来自「release」(a1b2c3d4)\n')
  // no title, no header line: the body follows line 1 and is not truncated
  const plain = messageText('a1b2c3d4', body, undefined)
  assert.strictEqual(plain.slice('Agent a1b2c3d4 sent a message:\n'.length), body)
  // the body is not what gets sanitized: only the title is
  assert.ok(messageText('a1b2c3d4', 'a\nb', 'X').endsWith('\na\nb'))
})

test('source-host-contract', () => {
  console.log('CASE source-host-contract')
  // AgentMessageSource in dsh-subagent declares exactly these three keys, and the
  // host's assertSource() validates 'agent-message' against them strictly. A
  // private kind is not on the 15-kind whitelist at all.
  const src = messageSource('session-abc')
  assert.deepStrictEqual(Object.keys(src).sort(), ['form', 'kind', 'senderSessionId'])
  assert.strictEqual(src.kind, 'agent-message')
  assert.strictEqual(src.form, 'relay')
  assert.strictEqual(src.senderSessionId, 'session-abc')
  assert.strictEqual(Object.keys(src).length, 3)
  // ids are stringified, never passed through as whatever shape the caller had
  assert.deepStrictEqual(messageSource(7), { kind: 'agent-message', form: 'relay', senderSessionId: '7' })
})

test('resolve-title', () => {
  console.log('CASE resolve-title')
  const titles = {
    [A]: '主会话与子Agent通信机制',
    [B]: 'explore-阅读体验',
    [C]: 'explore-阅读体验',
  }
  const t = buildAliasTable([A, B, C].map((id) => ({ ...row(id), title: titles[id] })))
  // a unique exact title addresses the session the user actually named
  assert.strictEqual(resolveTarget(t, '主会话与子Agent通信机制', null).entry.id, A)
  // a title shared by two sessions is refused, never guessed
  const shared = resolveTarget(t, 'explore-阅读体验', null)
  assert.strictEqual(shared.reason, 'ambiguous')
  assert.strictEqual(shared.candidates.length, 2)
  // a partial title is enough while it stays unique
  assert.strictEqual(resolveTarget(t, '子Agent', null).entry.id, A)
  assert.strictEqual(resolveTarget(t, 'explore', null).reason, 'ambiguous')
  // titles go through the same self check as ids
  assert.strictEqual(resolveTarget(t, '主会话与子Agent通信机制', A).reason, 'self')
})

test('validate-title', () => {
  console.log('CASE validate-title')
  assert.strictEqual(validateTitle('唤醒投递方案'), undefined)
  assert.strictEqual(validateTitle('  '), 'empty')
  assert.strictEqual(validateTitle(''), 'empty')
  assert.strictEqual(validateTitle(undefined), 'empty')
  assert.strictEqual(validateTitle('a\nb'), 'multiline')
  assert.strictEqual(validateTitle('a\r\nb'), 'multiline')
  // The length cap belongs to the session-title service (maxTitleBytes), not here:
  // this only refuses what no service could accept.
  assert.strictEqual(validateTitle('长'.repeat(200)), undefined)
})

// ---- cold-session wake (mailbox-wake) -------------------------------------

test('wake-verdict-not-found', () => {
  console.log('CASE wake-verdict-not-found')
  const verdict = wakeFailureVerdict({ code: 'session/not-found', message: 'session "x" not found', details: { sessionId: 'x' } })
  assert.strictEqual(verdict.ok, false)
  assert.strictEqual(verdict.reason, 'not-found')
  assert.strictEqual(verdict.detail, 'session "x" not found')
})

test('wake-verdict-subagent', () => {
  console.log('CASE wake-verdict-subagent')
  const owned = wakeFailureVerdict({ code: 'session/agent-busy', message: 'owned', details: { reason: 'use subagent delivery for this child session' } })
  assert.strictEqual(owned.reason, 'subagent')
  // agent-busy also covers prompt/continuation failures: only the subagent reason counts.
  const other = wakeFailureVerdict({ code: 'session/agent-busy', message: 'prompt rejected', details: { reason: 'NO_CONTINUABLE_FAILURE_OR_PENDING_INPUT' } })
  assert.strictEqual(other.reason, 'internal')
})

test('wake-verdict-writer-held', () => {
  console.log('CASE wake-verdict-writer-held')
  const verdict = wakeFailureVerdict({ code: 'session/writer-held', message: 'held', details: { sessionId: 'x' } })
  assert.strictEqual(verdict.reason, 'writer-held')
})

test('wake-verdict-internal', () => {
  console.log('CASE wake-verdict-internal')
  assert.strictEqual(wakeFailureVerdict(undefined).reason, 'internal')
  assert.strictEqual(wakeFailureVerdict(null).reason, 'internal')
  assert.strictEqual(wakeFailureVerdict({ message: 'no code' }).reason, 'internal')
  assert.strictEqual(wakeFailureVerdict({ code: 'gateway/internal', message: 'resume failed' }).reason, 'internal')
})

test('cold-admission-order', () => {
  console.log('CASE cold-admission-order')
  // Six values only; allow === undefined means allow-all, exactly as decideDelivery.
  assert.strictEqual(coldAdmission({ allow: undefined, archived: [], id: 'session-a' }), 'ok')
  assert.strictEqual(coldAdmission({ allow: 'session-a', archived: [], id: 'session-a' }), 'allow-unreadable')
  assert.strictEqual(coldAdmission({ allow: [], archived: [], id: 'session-a' }), 'denied-all')
  assert.strictEqual(coldAdmission({ allow: ['session-b'], archived: [], id: 'session-a' }), 'denied')
  // The allow list is decided before the archived set.
  assert.strictEqual(coldAdmission({ allow: ['session-b'], archived: ['session-a'], id: 'session-a' }), 'denied')
  assert.strictEqual(coldAdmission({ allow: undefined, archived: undefined, id: 'session-a' }), 'archived-unreadable')
  assert.strictEqual(coldAdmission({ allow: undefined, archived: ['session-a'], id: 'session-a' }), 'archived')
  assert.strictEqual(coldAdmission({ allow: ['session-a'], archived: ['session-b'], id: 'session-a' }), 'ok')
  const allowed = new Set(['allow-unreadable', 'denied-all', 'denied', 'archived-unreadable', 'archived', 'ok'])
  const every = [
    coldAdmission({ allow: undefined, archived: [], id: 'a' }),
    coldAdmission({ allow: 'x', archived: [], id: 'a' }),
    coldAdmission({ allow: [], archived: [], id: 'a' }),
    coldAdmission({ allow: ['b'], archived: [], id: 'a' }),
    coldAdmission({ allow: undefined, archived: undefined, id: 'a' }),
    coldAdmission({ allow: undefined, archived: ['a'], id: 'a' }),
  ]
  for (const value of every) assert.ok(allowed.has(value), `unexpected verdict ${value}`)
})
