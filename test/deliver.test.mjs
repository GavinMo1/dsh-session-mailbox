import test from 'node:test'
import assert from 'node:assert'
import { deliverUnattributed } from '../lib/deliver.js'

// A fake ctx carrying only what the delivery step touches: the agents service
// (for withoutInitiator) and the sessions service (for flush). No real
// delivery, no real session: every service is a spy.

function fakeCtx({ sessions = {}, order = [] } = {}) {
  const calls = { withoutInitiator: 0, send: 0, flush: [] }
  const ctx = {
    calls,
    agents: {
      withoutInitiator(fn) {
        calls.withoutInitiator += 1
        order.push('withoutInitiator')
        return fn()
      },
    },
    get(name) {
      return name === 'sessions' ? ctx.sessions : undefined
    },
    sessions: {
      async flush(session) {
        calls.flush.push(session)
        order.push('flush')
        if (typeof sessions.flush === 'function') return sessions.flush(session)
        return undefined
      },
    },
  }
  return ctx
}

test('deliver-unattributed-once', async () => {
  console.log('CASE deliver-unattributed-once')
  const order = []
  const ctx = fakeCtx({ order })
  const target = { session: { id: 'session-target' } }
  const send = () => {
    ctx.calls.send += 1
    order.push('send')
  }

  await deliverUnattributed(ctx, target, send)

  // withoutInitiator wraps the splice exactly once, the splice happens inside it,
  // and the flush lands after the message is accepted — in that order.
  assert.strictEqual(ctx.calls.withoutInitiator, 1)
  assert.strictEqual(ctx.calls.send, 1)
  assert.deepStrictEqual(order, ['withoutInitiator', 'send', 'flush'])
  // flush is given the live session, not the agent and not the id
  assert.strictEqual(ctx.calls.flush.length, 1)
  assert.strictEqual(ctx.calls.flush[0], target.session)
})

test('deliver-flush-awaited', async () => {
  console.log('CASE deliver-flush-awaited')
  // The flush must be awaited, not fired and forgotten: delivery is not complete
  // until the write is. A pending flush keeps the call pending.
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const order = []
  const ctx = fakeCtx({ order, sessions: { flush: () => gate } })
  let settled = false
  const run = deliverUnattributed(ctx, { session: { id: 's' } }, () => { order.push('send') })
    .then(() => { settled = true })

  await Promise.resolve()
  assert.strictEqual(settled, false, 'deliverUnattributed resolved before the flush settled')
  assert.deepStrictEqual(order, ['withoutInitiator', 'send', 'flush'])

  release()
  await run
  assert.strictEqual(settled, true)
})

test('deliver-no-sessions-service', async () => {
  console.log('CASE deliver-no-sessions-service')
  // A profile without the sessions service still delivers: the splice happened,
  // only the disk flush is skipped — and nothing throws.
  const calls = { withoutInitiator: 0, send: 0 }
  const ctx = {
    agents: { withoutInitiator(fn) { calls.withoutInitiator += 1; return fn() } },
    get() { return undefined },
    sessions: undefined,
  }
  await deliverUnattributed(ctx, { session: { id: 's' } }, () => { calls.send += 1 })
  assert.strictEqual(calls.withoutInitiator, 1)
  assert.strictEqual(calls.send, 1)
})

test('deliver-flush-failure-swallowed', async () => {
  console.log('CASE deliver-flush-failure-swallowed')
  // A rejecting flush must not turn an accepted message into a failed call.
  const calls = { withoutInitiator: 0, send: 0, flush: 0 }
  const ctx = {
    agents: { withoutInitiator(fn) { calls.withoutInitiator += 1; return fn() } },
    get() { return { flush() { calls.flush += 1; return Promise.reject(new Error('disk full')) } } },
  }
  await deliverUnattributed(ctx, { session: { id: 's' } }, () => { calls.send += 1 })
  assert.strictEqual(calls.flush, 1)
  assert.strictEqual(calls.send, 1)
})
