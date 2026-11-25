// Tests for the branch switcher's pure helpers.
//
// The shipped `client.js` is loaded as-is (no copy, no bundler): the only stub
// is `window.__ModuleLoader__.load`, which captures the plugin definition so the
// factory can be invoked with a fake `require`. Only the `__test` exports are
// exercised — nothing here touches React, the DOM or the Host.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'client.js')

/** Minimal `require` the factory asks for; anything else is a mistake. */
const fakeRequire = (id) => {
  if (id === 'react') return { createElement: () => null, Fragment: Symbol('Fragment') }
  if (id === 'react-dom') return { createPortal: () => null }
  throw new Error(`unexpected require(${id})`)
}

let definition = null
const fakeWindow = { __ModuleLoader__: { load: (def) => { definition = def } } }
new Function('window', readFileSync(clientPath, 'utf8'))(fakeWindow)

assert.equal(definition?.id, 'dsh-branch-switcher', 'client.js must register itself under its plugin id')
const plugin = definition.factory(fakeRequire)
const { familyOf, relativeTime, isBranchRow } = plugin.__test

// --- fixtures ---------------------------------------------------------------

/** One `sessions.list` row. */
const row = (id, extra = {}) => ({ id, title: `title-${id}`, updatedAt: 0, ...extra })

/** A `sessions.list` snapshot in the shape the Client publishes. */
const view = (rows) => ({
  ids: rows.map((entry) => entry.id),
  byId: Object.fromEntries(rows.map((entry) => [entry.id, entry])),
})

/** Translator stub: `t('key')` -> `'key'`, `t('key', {n: 3})` -> `'key:3'`. */
const t = (key, params) => (params === undefined ? key : `${key}:${params.n}`)

const ids = (family) => family.rows.map((entry) => entry.id)

// --- isBranchRow ------------------------------------------------------------

test('isBranchRow rejects nothing-rows and subagent sessions only', () => {
  assert.equal(isBranchRow(undefined), false)
  assert.equal(isBranchRow(null), false)
  assert.equal(isBranchRow(row('s', { origin: 'subagent' })), false)
  assert.equal(isBranchRow(row('a')), true)
  assert.equal(isBranchRow(row('a', { parentId: 'p' })), true)
})

// --- familyOf ---------------------------------------------------------------

test('a session with no relative is alone in its family', () => {
  const family = familyOf(view([row('a')]), 'a', [])
  assert.deepEqual(ids(family), ['a'])
  assert.equal(family.others, 0)
  assert.deepEqual(
    { depth: family.rows[0].depth, current: family.rows[0].current, last: family.rows[0].last },
    { depth: 0, current: true, last: true },
  )
})

test('a branch sees its parent and its siblings, rooted above itself', () => {
  const family = familyOf(view([row('p'), row('a', { parentId: 'p' }), row('b', { parentId: 'p' })]), 'a', [])
  assert.deepEqual(ids(family), ['p', 'a', 'b'])
  assert.equal(family.others, 2)
  assert.deepEqual(family.rows.map((entry) => entry.depth), [0, 1, 1])
})

test('the parent sees every branch cut from it', () => {
  const family = familyOf(view([row('p'), row('a', { parentId: 'p' }), row('b', { parentId: 'p' })]), 'p', [])
  assert.deepEqual(ids(family), ['p', 'a', 'b'])
  assert.deepEqual(family.rows.map((entry) => entry.current), [true, false, false])
})

test('a chain from the top-most ancestor carries depth and connector guides', () => {
  const family = familyOf(view([row('p'), row('m', { parentId: 'p' }), row('c', { parentId: 'm' })]), 'c', [])
  assert.deepEqual(ids(family), ['p', 'm', 'c'])
  assert.deepEqual(family.rows.map((entry) => entry.depth), [0, 1, 2])
  assert.deepEqual(family.rows.map((entry) => entry.guides), [[], [true], [true, true]])
  assert.deepEqual(family.rows.map((entry) => entry.last), [true, true, true])
  assert.deepEqual(family.rows.map((entry) => entry.ancestor), [true, true, false])
})

test('the last child closes its level, earlier siblings leave the guide open', () => {
  const family = familyOf(
    view([row('p'), row('a', { parentId: 'p' }), row('b', { parentId: 'p' }), row('a1', { parentId: 'a' })]),
    'a1',
    [],
  )
  assert.deepEqual(ids(family), ['p', 'a', 'a1', 'b'])
  const byId = Object.fromEntries(family.rows.map((entry) => [entry.id, entry]))
  assert.deepEqual(byId.a.guides, [true])
  assert.equal(byId.a.last, false, 'a is followed by b, so it is not the last sibling')
  assert.deepEqual(byId.a1.guides, [true, false], 'a1 hangs off a level that stays open')
  assert.equal(byId.b.last, true)
})

test('a subagent session is never a branch candidate', () => {
  assert.equal(familyOf(view([row('s', { origin: 'subagent' })]), 's', []), null)
})

test('subagent children are left out of a parent family', () => {
  const family = familyOf(view([row('p'), row('a', { parentId: 'p' }), row('s', { parentId: 'p', origin: 'subagent' })]), 'p', [])
  assert.deepEqual(ids(family), ['p', 'a'])
})

test('a missing parent makes the current session the root', () => {
  const family = familyOf(view([row('a', { parentId: 'ghost' })]), 'a', [])
  assert.deepEqual(ids(family), ['a'])
  assert.equal(family.rows[0].depth, 0)
})

test('a parent cycle stops climbing instead of looping forever', () => {
  const family = familyOf(view([row('a', { parentId: 'b' }), row('b', { parentId: 'a' })]), 'a', [])
  assert.equal(family.rows.length, 2)
  assert.deepEqual([...ids(family)].sort(), ['a', 'b'])
})

test('archived sessions stay in the tree, flagged and counted', () => {
  const family = familyOf(view([row('a'), row('b', { parentId: 'a' })]), 'a', ['b'])
  assert.deepEqual(ids(family), ['a', 'b'])
  assert.equal(family.rows[1].archived, true)
  assert.equal(family.rows[0].archived, false)
  assert.equal(family.others, 1, 'an archived relative still counts: the map shows where it came from')
})

test('titles fall back from displayTitle to title to the id', () => {
  const family = familyOf(
    view([
      row('p', { displayTitle: 'Shown', title: 'Ignored' }),
      row('a', { parentId: 'p', title: 'From title' }),
      row('b', { parentId: 'p', title: '' }),
    ]),
    'p',
    [],
  )
  const byId = Object.fromEntries(family.rows.map((entry) => [entry.id, entry]))
  assert.equal(byId.p.title, 'Shown')
  assert.equal(byId.a.title, 'From title')
  assert.equal(byId.b.title, 'b')
})

test('running and updatedAt are passed through with safe defaults', () => {
  const family = familyOf(
    view([row('a', { updatedAt: 1763000000000 }), row('b', { parentId: 'a', running: true })]),
    'a',
    [],
  )
  const byId = Object.fromEntries(family.rows.map((entry) => [entry.id, entry]))
  assert.equal(byId.a.updatedAt, 1763000000000)
  assert.equal(byId.a.running, false)
  assert.equal(byId.b.running, true)
  assert.equal(byId.b.updatedAt, 0)
})

test('a view that cannot carry lineage yields null instead of throwing', () => {
  assert.equal(familyOf(undefined, 'a', []), null)
  assert.equal(familyOf(null, 'a', []), null)
  assert.equal(familyOf({ ids: [], byId: null }, 'a', []), null)
  assert.equal(familyOf(view([row('a')]), undefined, []), null)
  assert.equal(familyOf(view([row('a')]), 'missing', []), null)
})

// --- relativeTime -----------------------------------------------------------

test('relative time wears off: now, minutes, hours, days', () => {
  const now = 1763000000000
  assert.equal(relativeTime(now, now, t), 'time.justNow')
  assert.equal(relativeTime(now, now - 59_000, t), 'time.justNow')
  assert.equal(relativeTime(now, now - 5 * 60_000, t), 'time.minutesAgo:5')
  assert.equal(relativeTime(now, now - 59 * 60_000, t), 'time.minutesAgo:59')
  assert.equal(relativeTime(now, now - 3 * 3_600_000, t), 'time.hoursAgo:3')
  assert.equal(relativeTime(now, now - 23 * 3_600_000, t), 'time.hoursAgo:23')
  assert.equal(relativeTime(now, now - 2 * 86_400_000, t), 'time.daysAgo:2')
  assert.equal(relativeTime(now, now - 6 * 86_400_000, t), 'time.daysAgo:6')
})

test('past a week relative time becomes an absolute date', () => {
  const time = new Date(2026, 0, 5, 12, 0, 0).getTime()
  const now = time + 8 * 86_400_000
  assert.equal(relativeTime(now, time, t), '2026-01-05')

  const later = new Date(2026, 10, 20, 9, 0, 0).getTime()
  assert.equal(relativeTime(later, new Date(2026, 10, 3, 9, 0, 0).getTime(), t), '2026-11-03')
})

test('a row without a usable timestamp renders nothing', () => {
  const now = 1763000000000
  assert.equal(relativeTime(now, 0, t), '')
  assert.equal(relativeTime(now, -1, t), '')
  assert.equal(relativeTime(now, undefined, t), '')
  assert.equal(relativeTime(now, Number.NaN, t), '')
  assert.equal(relativeTime(now, '1763000000000', t), '')
})

test('a clock that ran backwards still reads as just now', () => {
  const now = 1763000000000
  assert.equal(relativeTime(now, now + 60_000, t), 'time.justNow')
})
