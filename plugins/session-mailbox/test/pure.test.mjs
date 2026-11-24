import test from 'node:test'
import assert from 'node:assert'
import {
  pageStatus,
  primitiveFor,
  buildAliasTable,
  decideDelivery,
  validateMessage,
  resolveTarget,
  messageText,
  messageSource,
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
  assert.strictEqual(src.kind, 'session-mailbox')
  assert.strictEqual(src.form, 'relay')
  assert.strictEqual(src.senderSessionId, 's-1')
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
