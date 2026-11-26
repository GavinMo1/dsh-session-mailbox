import test from 'node:test'
import assert from 'node:assert'
import {
  idleVerdict,
  executionVerdict,
  tokenCount,
  sizeComparison,
} from '../lib/compact.js'

// Pure logic only: no host, no fake ctx. Everything compact_session decides
// before it talks to `ctx.commands` or the token meter is testable here.

test('idle-verdict', () => {
  console.log('CASE idle-verdict')
  // The raw Agent.status union: only a live turn is refused.
  assert.strictEqual(idleVerdict('running'), 'busy')
  assert.strictEqual(idleVerdict('idle'), 'idle')
  // Anything else is not a running turn. This is not pageStatus: 'inactive' is
  // a display word, and an absent status must not be read as "busy".
  assert.strictEqual(idleVerdict('inactive'), 'idle')
  assert.strictEqual(idleVerdict(undefined), 'idle')
})

test('execution-missing-means-no-command', () => {
  console.log('CASE execution-missing-means-no-command')
  // `undefined` is the host's only reliable "no such command" signal: it comes
  // back both for a name the per-agent view does not hold and for a line that
  // does not parse. It is not an error result — nothing was logged.
  assert.deepStrictEqual(executionVerdict(undefined), { kind: 'missing' })
  assert.deepStrictEqual(executionVerdict(null), { kind: 'missing' })
})

test('execution-success', () => {
  console.log('CASE execution-success')
  assert.deepStrictEqual(
    executionVerdict({ commandId: 'c1', result: { kind: 'success', text: 'Compacted 3 history items (~900 tokens).' } }),
    { kind: 'success', text: 'Compacted 3 history items (~900 tokens).' },
  )
  // Success without text is still success: `text` is optional on the host side.
  assert.deepStrictEqual(executionVerdict({ commandId: 'c1', result: { kind: 'success' } }), { kind: 'success' })
})

test('execution-error-keeps-host-text', () => {
  console.log('CASE execution-error-keeps-host-text')
  // The busy path arrives here, and the host's own sentence is what the caller
  // gets — no re-wording, no substring sniffing for the word "busy".
  const busy = 'Compaction is unavailable because this process has an active compaction, or the agent is not idle.'
  assert.deepStrictEqual(executionVerdict({ commandId: 'c1', result: { kind: 'error', text: busy } }), { kind: 'error', text: busy })
  // An error with no text still has to say something true.
  assert.strictEqual(executionVerdict({ commandId: 'c1', result: { kind: 'error' } }).kind, 'error')
  assert.match(executionVerdict({ commandId: 'c1', result: { kind: 'error', text: '' } }).text, /without saying why/)
})

test('execution-malformed', () => {
  console.log('CASE execution-malformed')
  // A settled execution must carry { commandId, result }; a shape we do not
  // understand is reported, never treated as success.
  assert.strictEqual(executionVerdict({ commandId: 'c1' }).kind, 'malformed')
  assert.strictEqual(executionVerdict({ commandId: 'c1', result: { kind: 'partial' } }).kind, 'malformed')
  assert.strictEqual(executionVerdict('ok').kind, 'malformed')
})

test('token-count-rejects-garbage', () => {
  console.log('CASE token-count-rejects-garbage')
  assert.strictEqual(tokenCount(1234), 1234)
  assert.strictEqual(tokenCount(1234.6), 1235)
  assert.strictEqual(tokenCount(0), 0)
  // Absent is a first-class answer: a fabricated 0 would read as "empty session".
  assert.strictEqual(tokenCount(undefined), undefined)
  assert.strictEqual(tokenCount(null), undefined)
  assert.strictEqual(tokenCount(-1), undefined)
  assert.strictEqual(tokenCount(Number.NaN), undefined)
  assert.strictEqual(tokenCount(Number.POSITIVE_INFINITY), undefined)
  assert.strictEqual(tokenCount('1234'), undefined)
})

test('size-comparison-shrank', () => {
  console.log('CASE size-comparison-shrank')
  assert.deepStrictEqual(sizeComparison(40000, 9000), {
    ok: true,
    before: 40000,
    after: 9000,
    delta: 31000,
    direction: 'shrank',
  })
})

test('size-comparison-grew-is-reported-not-hidden', () => {
  console.log('CASE size-comparison-grew-is-reported-not-hidden')
  // A compaction that had to grow is a fact, not a failure: the delta is signed.
  const grew = sizeComparison(9000, 12000)
  assert.strictEqual(grew.ok, true)
  assert.strictEqual(grew.delta, -3000)
  assert.strictEqual(grew.direction, 'grew')
  assert.strictEqual(sizeComparison(500, 500).direction, 'same')
})

test('size-comparison-half-known', () => {
  console.log('CASE size-comparison-half-known')
  // Never fill the missing end in. One known end is reported alone, both
  // unknown means the tool says it has no counts.
  assert.deepStrictEqual(sizeComparison(undefined, 9000), { ok: false, reason: 'no-before', after: 9000 })
  assert.deepStrictEqual(sizeComparison(40000, undefined), { ok: false, reason: 'no-after', before: 40000 })
  assert.deepStrictEqual(sizeComparison(undefined, undefined), { ok: false, reason: 'no-counts' })
})
