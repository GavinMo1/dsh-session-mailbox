import test from 'node:test'
import assert from 'node:assert'
import {
  refusalFor,
  normalizePath,
  samePath,
  pickDefaultWorkspace,
  createdFromDiff,
  promptContent,
  subagentVerdict,
  gateVerdict,
  deleteVerdict,
} from '../lib/create.js'

const ws = (id, path, sessionIds = []) => ({ id, path, title: id, sessionIds })

test('pick-by-accounting', () => {
  console.log('CASE pick-by-accounting')
  const mine = ws('w1', 'C:\\a', ['session-me'])
  const other = ws('w2', 'C:\\b', ['session-x'])
  const picked = pickDefaultWorkspace({
    workspaces: [mine, other],
    callerCwd: 'C:\\b',
    callerSessionId: 'session-me',
  })
  // accounting wins over the cwd match
  assert.strictEqual(picked.ok, true)
  assert.strictEqual(picked.workspace.id, 'w1')
})

test('pick-by-cwd', () => {
  console.log('CASE pick-by-cwd')
  const picked = pickDefaultWorkspace({
    workspaces: [ws('w1', 'C:\\a'), ws('w2', 'C:\\b')],
    callerCwd: 'C:\\b',
    callerSessionId: 'session-unknown',
  })
  assert.strictEqual(picked.ok, true)
  assert.strictEqual(picked.workspace.id, 'w2')
})

test('pick-no-cwd', () => {
  console.log('CASE pick-no-cwd')
  const picked = pickDefaultWorkspace({
    workspaces: [ws('w1', 'C:\\a')],
    callerCwd: undefined,
    callerSessionId: 'session-unknown',
  })
  assert.deepStrictEqual(picked, { ok: false, reason: 'no-cwd' })
})

test('pick-no-workspace', () => {
  console.log('CASE pick-no-workspace')
  const picked = pickDefaultWorkspace({
    workspaces: [ws('w1', 'C:\\a')],
    callerCwd: 'C:\\nowhere',
    callerSessionId: 'session-unknown',
  })
  assert.deepStrictEqual(picked, { ok: false, reason: 'no-workspace-for-caller' })
})

test('pick-accounting-first', () => {
  console.log('CASE pick-accounting-first')
  // both a cwd match and an accounting match exist and they disagree
  const byAccounting = ws('w-accounting', 'C:\\shared', ['session-me'])
  const byCwdOnly = ws('w-cwd', 'C:\\here')
  const picked = pickDefaultWorkspace({
    workspaces: [byCwdOnly, byAccounting],
    callerCwd: 'C:\\here',
    callerSessionId: 'session-me',
  })
  assert.strictEqual(picked.ok, true)
  assert.strictEqual(picked.workspace.id, 'w-accounting')
})

test('pick-empty-registry', () => {
  console.log('CASE pick-empty-registry')
  const picked = pickDefaultWorkspace({
    workspaces: [],
    callerCwd: 'C:\\here',
    callerSessionId: 'session-me',
  })
  assert.deepStrictEqual(picked, { ok: false, reason: 'no-workspace-for-caller' })
})

test('same-path-case', () => {
  console.log('CASE same-path-case')
  assert.strictEqual(samePath('C:\\Users\\Example', 'c:\\users\\example'), true)
  assert.strictEqual(samePath('C:\\Users\\a', 'C:\\Users\\b'), false)
})

test('same-path-trailing', () => {
  console.log('CASE same-path-trailing')
  assert.strictEqual(samePath('C:\\Users\\example\\', 'C:\\Users\\example'), true)
  assert.strictEqual(samePath('C:\\Users\\example\\\\', 'C:\\Users\\EXAMPLE'), true)
})

test('same-path-drive-root', () => {
  console.log('CASE same-path-drive-root')
  // Assert the normalized VALUE, not just the comparison: a comparison alone
  // cannot tell a correct implementation from one that truncates the root.
  assert.strictEqual(normalizePath('C:\\'), 'c:\\')
  assert.strictEqual(normalizePath('C:\\Windows\\'), 'c:\\windows')
  assert.strictEqual(normalizePath('C:\\'), samePath('C:\\', 'c:\\') ? normalizePath('C:\\') : 'MISMATCH')
  assert.strictEqual(samePath('C:\\', 'c:\\'), true)
  assert.strictEqual(samePath('D:\\', 'C:\\'), false)
})

test('subagent-refused', () => {
  console.log('CASE subagent-refused')
  assert.strictEqual(refusalFor({ origin: 'subagent' }), 'subagent')
  assert.strictEqual(refusalFor({}), undefined)
})

test('delegation-depth-refused', () => {
  console.log('CASE delegation-depth-refused')
  assert.strictEqual(refusalFor({ delegationDepth: 1 }), 'subagent')
  assert.strictEqual(refusalFor({ delegationDepth: 0 }), undefined)
  // a non-numeric value is not a depth claim
  assert.strictEqual(refusalFor({ delegationDepth: '1' }), undefined)
})

test('fork-not-refused', () => {
  console.log('CASE fork-not-refused')
  // an ordinary session fork carries none of the subagent markers
  const forked = { id: 'session-fork', cwd: 'C:\\work', parentSession: 'session-origin' }
  assert.strictEqual(refusalFor(forked), undefined)
  assert.strictEqual(refusalFor(undefined), undefined)
})

test('created-by-id-diff', () => {
  console.log('CASE created-by-id-diff')
  const before = new Set(['w1', 'w2'])
  assert.strictEqual(createdFromDiff(before, 'w3'), true)
  assert.strictEqual(createdFromDiff(before, 'w2'), false)
  // ids are compared as strings, so a non-string id still matches
  assert.strictEqual(createdFromDiff(new Set(['7']), 7), false)
})

test('prompt-shape', () => {
  console.log('CASE prompt-shape')
  assert.deepStrictEqual(promptContent('只回一个字：好'), [{ type: 'text', text: '只回一个字：好' }])
  assert.strictEqual(promptContent('   '), undefined)
  assert.strictEqual(promptContent(''), undefined)
  assert.strictEqual(promptContent(undefined), undefined)
  // whitespace padding inside real content is preserved verbatim
  assert.deepStrictEqual(promptContent(' a '), [{ type: 'text', text: ' a ' }])
})

test('verdict-subagent-header', () => {
  console.log('CASE verdict-subagent-header')
  // header alone refuses, whatever the root says
  assert.strictEqual(subagentVerdict({ header: { origin: 'subagent' }, root: { id: 'me' }, callerId: 'me' }), 'subagent')
  assert.strictEqual(subagentVerdict({ header: { delegationDepth: 2 }, root: { id: 'me' }, callerId: 'me' }), 'subagent')
})

test('verdict-root-points-elsewhere', () => {
  console.log('CASE verdict-root-points-elsewhere')
  // rootOf RETURNS another agent for a descendant — it does not throw — so an id
  // comparison is the only thing that catches this case.
  assert.strictEqual(subagentVerdict({ header: {}, root: { id: 'lead' }, callerId: 'child' }), 'subagent')
  assert.strictEqual(subagentVerdict({ header: {}, root: { id: 'me' }, callerId: 'me' }), 'allow')
  // ids compare as strings
  assert.strictEqual(subagentVerdict({ header: {}, root: { id: 7 }, callerId: '7' }), 'allow')
})

test('verdict-unverifiable', () => {
  console.log('CASE verdict-unverifiable')
  // no usable root must not silently become "allow"
  assert.strictEqual(subagentVerdict({ header: {}, root: undefined, callerId: 'me' }), 'unverifiable')
  assert.strictEqual(subagentVerdict({ header: {}, root: {}, callerId: 'me' }), 'unverifiable')
})

test('gate-verdict', () => {
  console.log('CASE gate-verdict')
  assert.strictEqual(gateVerdict({ before: [], now: ['s1'], sessionId: 's1' }), 'ok')
  // not accounted after the call is the only failing verdict
  assert.strictEqual(gateVerdict({ before: [], now: [], sessionId: 's1' }), 'missing')
  assert.strictEqual(gateVerdict({ before: ['s0'], now: ['s0'], sessionId: 's1' }), 'missing')
  // a blank session the controller handed back was already there: a note, not a failure
  assert.strictEqual(gateVerdict({ before: ['s1'], now: ['s1'], sessionId: 's1' }), 'already-there')
  // id shapes disagreeing must still match
  assert.strictEqual(gateVerdict({ before: [], now: [7], sessionId: 7 }), 'ok')
})

test('delete-empty-workspace', () => {
  console.log('CASE delete-empty-workspace')
  assert.strictEqual(deleteVerdict({ sessionIds: [], callerId: 'me' }), 'ok')
  assert.strictEqual(deleteVerdict({ sessionIds: undefined, callerId: 'me' }), 'ok')
  // force is irrelevant when nothing is held
  assert.strictEqual(deleteVerdict({ sessionIds: [], callerId: 'me', force: true }), 'ok')
})

test('delete-holds-sessions', () => {
  console.log('CASE delete-holds-sessions')
  // deleting a registration does not detach its sessions, so a non-empty
  // workspace is refused by default
  assert.strictEqual(deleteVerdict({ sessionIds: ['s1'], callerId: 'me' }), 'holds-sessions')
  assert.strictEqual(deleteVerdict({ sessionIds: ['s1'], callerId: 'me', force: true }), 'ok')
})

test('delete-holds-caller', () => {
  console.log('CASE delete-holds-caller')
  // force must NOT override this one: it would hide the conversation in use
  assert.strictEqual(deleteVerdict({ sessionIds: ['me'], callerId: 'me' }), 'holds-caller')
  assert.strictEqual(deleteVerdict({ sessionIds: ['me'], callerId: 'me', force: true }), 'holds-caller')
  // id shapes disagreeing must still match
  assert.strictEqual(deleteVerdict({ sessionIds: [7], callerId: '7', force: true }), 'holds-caller')
})
