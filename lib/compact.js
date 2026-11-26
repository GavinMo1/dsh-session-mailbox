// Zero-dependency pure logic for compact_session.
// Only `node:` built-ins are allowed here.

/**
 * A manual compaction needs an idle agent.
 *
 * This is deliberately NOT `pageStatus`: that maps every non-`running` state to
 * `inactive` for display, which is the right vocabulary for a listing but the
 * wrong one for a precondition. The question here is only "is a turn on right
 * now", and the raw `Agent.status` union (`'idle' | 'running'`) answers it.
 * @returns 'idle' | 'busy'
 */
export function idleVerdict(status) {
  return status === 'running' ? 'busy' : 'idle'
}

/**
 * What a `CommandRuntime.execute()` return value means for this tool.
 *
 * `undefined` is the host's ONLY reliable "no such command" signal: `execute`
 * returns it both for an unparseable line and for a name the per-agent command
 * view does not hold. It is not an error path — nothing was logged, no handler
 * ran. (`plugin_manager`'s `enabled` flag is not an alternative: the desktop
 * layer substitutes rows, so it can disagree with what the runtime can run.)
 *
 * A settled execution is `{ commandId, result }`; `result` is
 * `{ kind: 'success', text?, sourceEventSeq? }` or `{ kind: 'error', text }`.
 * @returns { kind: 'missing' } | { kind: 'success', text? } | { kind: 'error', text } | { kind: 'malformed', detail }
 */
export function executionVerdict(execution) {
  if (execution === undefined || execution === null) return { kind: 'missing' }
  if (typeof execution !== 'object') return { kind: 'malformed', detail: 'execute returned ' + String(execution) }
  const result = execution.result
  if (result === undefined || result === null || typeof result !== 'object') {
    return { kind: 'malformed', detail: 'execution carried no result object' }
  }
  if (result.kind === 'success') {
    return typeof result.text === 'string' ? { kind: 'success', text: result.text } : { kind: 'success' }
  }
  if (result.kind === 'error') {
    return {
      kind: 'error',
      text: typeof result.text === 'string' && result.text !== ''
        ? result.text
        : 'the command reported an error without saying why',
    }
  }
  return { kind: 'malformed', detail: 'unknown result kind ' + String(result.kind) }
}

/**
 * One token count as the tool surface may state it: a finite non-negative
 * number of whole tokens, or nothing.
 *
 * Absent is a first-class answer. The meter reports its fields as optional and
 * omits them until their source events exist, so a fabricated 0 would read as
 * "this session is empty" — the opposite of true for a session that simply has
 * not been measured yet.
 */
export function tokenCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.round(value)
}

/**
 * The before/after pair the caller asked for, plus the signed change.
 *
 * `delta` is `before - after`: positive means the session shrank. A negative
 * delta is reported as-is rather than clamped, because a compaction that had to
 * grow (a summary plus a fresh turn can exceed what it replaced) is a fact the
 * caller should see, not an outcome to hide. A half-known pair is reported with
 * its known end only — never with a made-up other end.
 * @returns { ok: true, before, after, delta, direction } | { ok: false, reason, before?, after? }
 */
export function sizeComparison(before, after) {
  const b = tokenCount(before)
  const a = tokenCount(after)
  if (b === undefined && a === undefined) return { ok: false, reason: 'no-counts' }
  if (b === undefined) return { ok: false, reason: 'no-before', after: a }
  if (a === undefined) return { ok: false, reason: 'no-after', before: b }
  const delta = b - a
  return {
    ok: true,
    before: b,
    after: a,
    delta,
    direction: delta > 0 ? 'shrank' : (delta < 0 ? 'grew' : 'same'),
  }
}
