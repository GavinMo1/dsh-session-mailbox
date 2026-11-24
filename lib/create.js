// Zero-dependency pure logic for create_session / list_workspaces.
// Only `node:` built-ins are allowed here (currently: node:path).

import { resolve } from 'node:path'

/**
 * Does this session header claim to belong to a subagent?
 * Covers only what the header says about itself; a bare header whose tree root
 * is somebody else is caught by the `subagents.rootOf` check in index.js.
 * @returns 'subagent' when refused, otherwise undefined.
 */
export function refusalFor(header) {
  if (header === undefined || header === null) return undefined
  if (header.origin === 'subagent') return 'subagent'
  if (typeof header.delegationDepth === 'number' && header.delegationDepth > 0) return 'subagent'
  return undefined
}

/**
 * The one normalization this plugin compares paths with.
 * `resolve` already drops trailing separators on any non-root path, so a
 * filesystem root (`C:\`) keeps its separator and is never truncated to `C:`
 * (which Windows reads as "the current directory on drive C").
 * WINDOWS SEMANTICS: the lowercase step assumes a case-insensitive filesystem.
 * On a case-sensitive host this would call `/Home` and `/home` the same
 * directory, so do not reuse it there.
 */
export function normalizePath(value) {
  return resolve(String(value)).toLowerCase()
}

/**
 * Compare two paths for "same directory" purposes.
 * This is for the caller-cwd fallback only. It must NOT be used to decide
 * whether the registry already holds a path: `workspaceRegistry.create`
 * canonicalizes through fs.realpath and is idempotent on its own.
 */
export function samePath(a, b) {
  return normalizePath(a) === normalizePath(b)
}

/**
 * Decide whether create_session may proceed, given what the header claims and
 * where the caller's subagent tree root points.
 * `rootOf` has four outcomes: it throws twice, returns `activation.root`
 * (possibly another agent) once, and returns the caller itself once. So an id
 * comparison is required — "did not throw" is not the same as "is top-level".
 * @returns 'allow' | 'subagent' | 'unverifiable'
 */
export function subagentVerdict({ header, root, callerId }) {
  if (refusalFor(header) !== undefined) return 'subagent'
  if (root === undefined || root === null || root.id === undefined) return 'unverifiable'
  return String(root.id) === String(callerId) ? 'allow' : 'subagent'
}

/**
 * The post-create gate: was the new session absent before the call and is it
 * accounted now? `already-there` is not a failure — the controller can hand
 * back a blank session that was already in the account — but it is reported
 * separately so the caller can note it.
 * @returns 'ok' | 'already-there' | 'missing'
 */
export function gateVerdict({ before, now, sessionId }) {
  const id = String(sessionId)
  const nowIds = (Array.isArray(now) ? now : []).map(String)
  if (!nowIds.includes(id)) return 'missing'
  const beforeIds = (Array.isArray(before) ? before : []).map(String)
  return beforeIds.includes(id) ? 'already-there' : 'ok'
}

/**
 * Pick the workspace a session created without an explicit path should join.
 * Three exits, in this order:
 *   1. the caller's own session is already accounted somewhere;
 *   2. no caller cwd is available at all;
 *   3. a workspace whose path equals the caller cwd.
 * @returns { ok: true, workspace } or { ok: false, reason }
 */
export function pickDefaultWorkspace({ workspaces, callerCwd, callerSessionId }) {
  const list = Array.isArray(workspaces) ? workspaces : []
  const selfId = String(callerSessionId)

  const accounted = list.find((w) => (w.sessionIds ?? []).map(String).includes(selfId))
  if (accounted !== undefined) return { ok: true, workspace: accounted }

  if (callerCwd === undefined) return { ok: false, reason: 'no-cwd' }

  const byCwd = list.find((w) => samePath(w.path, callerCwd))
  if (byCwd !== undefined) return { ok: true, workspace: byCwd }

  return { ok: false, reason: 'no-workspace-for-caller' }
}

/**
 * Was this entity absent from the id snapshot taken before the call?
 * The single implementation of "created vs reused": never read a `created`
 * flag off a registry return value.
 */
export function createdFromDiff(before, entityId) {
  return !before.has(String(entityId))
}

/**
 * Turn the optional first message into prompt content parts.
 * Whitespace-only text counts as "no prompt".
 * @returns undefined, or [{ type: 'text', text }]
 */
export function promptContent(text) {
  if (typeof text !== 'string') return undefined
  if (text.trim() === '') return undefined
  return [{ type: 'text', text }]
}
