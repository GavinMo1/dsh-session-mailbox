import test from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { register } from 'node:module'

// compact_session is asynchronous now, and that is a TIMING property, so the
// lib-only tests in compact.test.mjs cannot see it. This file drives the real
// tool body through a fake ctx instead.
//
// Two pieces of scaffolding are unavoidable, both because this repo ships no
// node_modules on purpose (see AGENTS.md):
//   1. `index.js` has one bare ESM import (`@deepseek-ai/schemastery`, for the
//      Config export) — test/fixtures/host-resolver.mjs maps just that one.
//   2. `apply()` resolves its host packages with
//      `createRequire(anchor)('@deepseek-ai/dsh-tools')` — so a throwaway anchor
//      with two two-line stub packages is built in the OS temp dir below.
// `defineTool` and `createUserMessage` are thin wrappers on the host side, and
// the stubs are exactly as thin.
register(new URL('./fixtures/host-resolver.mjs', import.meta.url))
const { apply } = await import('../index.js')

const anchorRoot = mkdtempSync(join(tmpdir(), 'mailbox-compact-async-'))
const writeStub = (name, source) => {
  const dir = join(anchorRoot, 'node_modules', '@deepseek-ai', name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js' }))
  writeFileSync(join(dir, 'index.js'), source)
}
writeFileSync(join(anchorRoot, 'package.json'), JSON.stringify({ name: 'async-test-anchor', version: '0.0.0' }))
writeStub('dsh-tools', 'exports.defineTool = (definition) => definition\n')
writeStub('dsh-llm', 'exports.createUserMessage = (message) => message\n')

test.after(() => { rmSync(anchorRoot, { recursive: true, force: true }) })

const CALLER_ID = 'session-caller-0000-00000001'
const TARGET_ID = 'session-target-0000-00000002'

const makeAgent = (id, status) => ({
  id,
  status,
  session: { header: { origin: 'top-level', createdAt: 1, cwd: '/tmp' } },
  inbox: [],
  steered: 0,
  followup(message) { this.inbox.push(message) },
  steer(message) { this.steered += 1; this.inbox.push(message) },
})

/** A ctx holding exactly the services these code paths touch. */
const makeCtx = ({ agents, commands, meter, failInitiator = false }) => {
  const registered = new Map()
  const workspaceRegistry = { archivedSessionIds: [] }
  const ctx = {
    get(name) {
      if (name === 'profileContext') return { installAnchor: join(anchorRoot, 'package.json') }
      if (name === 'commands') return commands
      if (name === 'tokenMeter') return meter
      if (name === 'sessions') return { flush() {} }
      if (name === 'workspaceRegistry') return workspaceRegistry
      return undefined
    },
    agents: {
      list: () => agents,
      get: (id) => agents.find((a) => String(a.id) === String(id)),
      withoutInitiator: (send) => {
        // dsh-agent throws here when the initiator scope is closing/disposed,
        // which is exactly the state a detached task can find itself in.
        if (failInitiator) throw new Error('initiator scope is closing')
        return send()
      },
    },
    tools: { register: (definition) => registered.set(definition.name, definition) },
    systemPrompt: { context: () => {}, getContextOrder: () => 0 },
    workspaceRegistry,
  }
  return { ctx, registered }
}

const boot = (commands, meter, options = {}) => {
  const caller = makeAgent(CALLER_ID, 'idle')
  const target = makeAgent(TARGET_ID, 'idle')
  const { ctx, registered } = makeCtx({ agents: [caller, target], commands, meter, ...options })
  apply(ctx, {})
  const tool = registered.get('compact_session')
  assert.ok(tool !== undefined, 'compact_session must be registered')
  return { caller, target, tool }
}

/** Fail the test in a second instead of hanging the run for the timeout. */
const within = (ms, promise, label) => Promise.race([
  promise,
  new Promise((_resolve, reject) => setTimeout(() => reject(new Error(label + ' did not settle within ' + ms + 'ms')), ms).unref()),
])

/** Poll until `check()` is true; the notice is delivered by a detached task. */
const waitFor = async (check, label, ms = 2000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(label + ' did not happen within ' + ms + 'ms')
}

const textOf = (message) => {
  const part = message?.content?.[0]
  return typeof part?.text === 'string' ? part.text : ''
}

test('returns-started-without-waiting-for-the-command', async () => {
  console.log('CASE returns-started-without-waiting-for-the-command')
  // The command never settles. The call must still come back, and come back
  // saying `started` — this is the whole point of the change.
  let calls = 0
  const { tool, target } = boot({ execute: () => { calls += 1; return new Promise(() => {}) } }, {})

  const started = Date.now()
  const value = await within(2000, tool.execute({ agent: TARGET_ID }, { agent: makeAgent(CALLER_ID, 'running') }), 'compact_session')
  const elapsed = Date.now() - started

  assert.strictEqual(value.status, 'started')
  assert.strictEqual(value.target, TARGET_ID)
  assert.strictEqual(value.agent, '00000002')
  assert.match(value.note, /后台/)
  assert.strictEqual(calls, 1, 'the command must have been started exactly once')
  assert.ok(elapsed < 1000, 'returned in ' + elapsed + 'ms while the command was still running')
  console.log('  returned in ' + elapsed + 'ms; command still pending; target inbox empty =', target.inbox.length === 0)
})

test('completion-notice-carries-before-and-after', async () => {
  console.log('CASE completion-notice-carries-before-and-after')
  const meter = { measure: () => ({ totalTokens: 9000 }), contextPressure: () => ({ contextWindow: 200000, pressureTokens: 8000 }) }
  const { tool, caller, target } = boot({
    execute: async () => {
      meter.measure = () => ({ totalTokens: 9000 })   // 从这一刻起读到的就是压缩后的大小
      return { commandId: 'c1', result: { kind: 'success', text: 'Compacted 3 history items (~900 tokens).' } }
    },
  }, meter)
  meter.measure = () => ({ totalTokens: 40000 })      // 调用前的大小

  const value = await within(2000, tool.execute({ agent: TARGET_ID }, { agent: caller }), 'compact_session')
  assert.strictEqual(value.status, 'started')

  await waitFor(() => caller.inbox.length > 0, 'the completion notice')
  const text = textOf(caller.inbox[0])
  assert.match(text, /压缩完成/)
  assert.match(text, /00000002/, 'the notice names the compacted session')
  assert.match(text, /40[,.]?000/)
  assert.match(text, /9[,.]?000/)
  assert.match(text, /200[,.]?000/, 'the window is reported when the meter has one')
  assert.match(text, /Compacted 3 history items/, "the host's own sentence is passed through")
  assert.strictEqual(caller.steered, 0, 'a notice uses followup, never steer')
  assert.strictEqual(target.inbox.length, 0, 'the target is not sent anything')
  console.log('  notice: ' + text.replace(/\n/g, ' / '))
})

test('rejected-command-becomes-a-notice-and-not-an-unhandled-rejection', async () => {
  console.log('CASE rejected-command-becomes-a-notice-and-not-an-unhandled-rejection')
  const unhandled = []
  const trap = (reason) => unhandled.push(reason)
  process.on('unhandledRejection', trap)
  try {
    const { tool, caller } = boot({ execute: () => Promise.reject(new Error('socket hang up')) }, {})
    const value = await within(2000, tool.execute({ agent: TARGET_ID }, { agent: caller }), 'compact_session')
    assert.strictEqual(value.status, 'started', 'a rejection happens after the call has already returned')

    await waitFor(() => caller.inbox.length > 0, 'the failure notice')
    const text = textOf(caller.inbox[0])
    assert.match(text, /这次没压成/)
    assert.match(text, /socket hang up/)
    assert.match(text, /可以再发一次/)
    // Give a would-be escaped rejection a turn or two to surface.
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepStrictEqual(unhandled, [], 'nothing may escape as an unhandled rejection')
    console.log('  notice: ' + text.replace(/\n/g, ' / ') + ' | unhandled rejections: ' + unhandled.length)
  } finally {
    process.off('unhandledRejection', trap)
  }
})

test('second-call-for-the-same-target-is-refused-not-queued', async () => {
  console.log('CASE second-call-for-the-same-target-is-refused-not-queued')
  let calls = 0
  const { tool, caller } = boot({ execute: () => { calls += 1; return new Promise(() => {}) } }, {})

  const first = await within(2000, tool.execute({ agent: TARGET_ID }, { agent: caller }), 'first compact_session')
  const second = await within(2000, tool.execute({ agent: TARGET_ID }, { agent: caller }), 'second compact_session')

  assert.strictEqual(first.status, 'started')
  assert.strictEqual(second.status, 'already-running')
  assert.strictEqual(second.target, TARGET_ID)
  assert.match(second.note, /不排队/)
  assert.strictEqual(calls, 1, 'the second call must not start another compaction')
  assert.strictEqual(caller.inbox.length, 0, 'the refusal is the return value, not a notice')
  console.log('  first = ' + first.status + ' | second = ' + second.status + ' | command calls = ' + calls)
})

test('notice-still-arrives-when-the-initiator-scope-is-gone', async () => {
  console.log('CASE notice-still-arrives-when-the-initiator-scope-is-gone')
  // `deliverUnattributed` goes through `agents.withoutInitiator`, which throws
  // when its scope is closing/disposed — the normal state for a task detached
  // from the turn that started it. The notice must survive that: attribution is
  // a nicety, delivery is the point.
  const meter = { measure: () => ({ totalTokens: 9000 }) }
  const { tool, caller } = boot({
    execute: async () => ({ commandId: 'c1', result: { kind: 'success' } }),
  }, meter, { failInitiator: true })

  await within(2000, tool.execute({ agent: TARGET_ID }, { agent: caller }), 'compact_session')
  await waitFor(() => caller.inbox.length > 0, 'the notice despite a closed initiator scope')
  assert.match(textOf(caller.inbox[0]), /压缩完成/)
  console.log('  notice delivered with the attribution wrapper unavailable')
})

test('cheap-preconditions-still-fail-before-the-call-returns', async () => {
  console.log('CASE cheap-preconditions-still-fail-before-the-call-returns')
  // busy: a running target is refused in the return value, not in a later message.
  {
    const caller = makeAgent(CALLER_ID, 'idle')
    const target = makeAgent(TARGET_ID, 'running')
    const { ctx, registered } = makeCtx({ agents: [caller, target], commands: { execute: () => new Promise(() => {}) }, meter: {} })
    apply(ctx, {})
    await assert.rejects(
      within(2000, registered.get('compact_session').execute({ agent: TARGET_ID }, { agent: caller }), 'busy compact_session'),
      /running a turn right now[\s\S]*Nothing was queued and nothing was retried/,
    )
    assert.strictEqual(caller.inbox.length, 0, 'a refused call sends no notice')
  }
  // no command runtime: still a synchronous, named error.
  {
    const caller = makeAgent(CALLER_ID, 'idle')
    const target = makeAgent(TARGET_ID, 'idle')
    const { ctx, registered } = makeCtx({ agents: [caller, target], commands: undefined, meter: {} })
    apply(ctx, {})
    await assert.rejects(
      within(2000, registered.get('compact_session').execute({ agent: TARGET_ID }, { agent: caller }), 'no-runtime compact_session'),
      /composes no command runtime/,
    )
  }
  // subagent caller: refused at execute time, as before.
  {
    const { tool } = boot({ execute: () => new Promise(() => {}) }, {})
    const subagent = makeAgent('session-subagent-0000-0003', 'idle')
    subagent.session.header.origin = 'subagent'
    await assert.rejects(
      within(2000, tool.execute({ agent: TARGET_ID }, { agent: subagent }), 'subagent compact_session'),
      /subagent cannot compact a peer/,
    )
  }
  console.log('  busy / no-runtime / subagent all refused in the return value')
})
