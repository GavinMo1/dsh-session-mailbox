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
 * The one sentence the caller gets from the call itself.
 *
 * The call no longer carries the outcome, so its note has to say where the
 * outcome went — a caller that reads "started" and nothing else will ask again
 * and get `already-running`. The cold-load clause is kept because "why did this
 * take a restart's worth of work" is a question the caller can otherwise only
 * guess at.
 */
export function startedNote({ woke }) {
  return '压缩在后台跑，压完会给调用方发一条消息'
    + (woke === true ? '（目标原先不在这个进程里，这次从磁盘装载的）' : '')
}

/**
 * Why the host refused to compact, in one sentence a caller can act on.
 *
 * `missing` and `malformed` are our readings of the return value, so the wording
 * is ours. `error` keeps the host's own text verbatim: it is the only party that
 * knows what went wrong, and re-wording it here would be guessing (the same rule
 * the old synchronous path followed).
 */
export function refusalReason(verdict) {
  if (verdict === undefined || verdict === null) return '宿主的 /compact 没有给出结果'
  if (verdict.kind === 'missing') return '这台 DSH 没有注册 /compact 命令，目标会话没有被压缩'
  if (verdict.kind === 'malformed') {
    return '宿主对 /compact 的返回看不懂（' + String(verdict.detail ?? 'no detail') + '）'
  }
  if (verdict.kind === 'error') return String(verdict.text)
  return '意料之外的 /compact 返回（' + String(verdict.kind) + '）'
}

/**
 * The success notice: which session, how big it was, how big it is now.
 *
 * Both ends are optional and neither is ever filled in. A half-known pair says
 * which end is missing rather than showing a fabricated zero, and a session with
 * no meter at all is reported as "compacted, size unknown" — the compaction
 * still happened, and telling the caller it did not would be the bigger lie.
 */
export function compactedNotice({ name, id, comparison, window, detail }) {
  const who = name + ' (' + id + ')'
  const n = (v) => v.toLocaleString()
  let size
  if (comparison === undefined || comparison === null) {
    size = '压了，但读不到前后大小'
  } else if (comparison.ok === true) {
    const moved = comparison.delta === 0
      ? '没变'
      : (comparison.delta > 0 ? '少了 ' + n(comparison.delta) : '反而大了 ' + n(-comparison.delta))
    size = n(comparison.before) + ' → ' + n(comparison.after) + ' tokens（' + moved + '）'
  } else if (comparison.reason === 'no-before') {
    size = '? → ' + n(comparison.after) + ' tokens（没有压缩前的大小）'
  } else if (comparison.reason === 'no-after') {
    size = n(comparison.before) + ' → ? tokens（没有压缩后的大小）'
  } else {
    size = '压了，但这台 DSH 读不到前后大小（没有 token 计量器）'
  }
  const tail = []
  if (isCount(window)) tail.push('窗口 ' + n(window))
  if (typeof detail === 'string' && detail !== '') tail.push('宿主说：' + detail)
  return '压缩完成：' + who + ' ' + size + (tail.length === 0 ? '' : '（' + tail.join('；') + '）')
}

/**
 * The failure notice.
 *
 * It says the two things a caller needs: nothing was compacted, and calling
 * again is allowed. Without the second line the caller is left choosing between
 * silently giving up and retrying something that might be unsafe to retry.
 */
export function failedNotice({ name, id, reason }) {
  const why = typeof reason === 'string' && reason !== '' ? reason : '宿主没有说明原因'
  return '这次没压成：' + name + ' (' + id + ')：' + why + '。没排队也没重试，可以再发一次。'
}

const isCount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0

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
