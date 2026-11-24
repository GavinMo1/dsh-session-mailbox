import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import * as um from '../lib/um.mjs'
import * as store from '../lib/store.mjs'

const sample = (over = {}) => ({
  schema: '1',
  id: '20261124-commit-lang',
  date: '2026-11-24',
  kind: 'decision',
  stagedOn: '2026-11-24T09:12:03Z',
  approvedBy: 'user, 2026-11-24',
  approvedOn: '2026-11-24T09:15:40Z',
  title: '提交信息用中文',
  body: '团队都用中文',
  ...over,
})

test('CASE tokenize-cjk', () => {
  assert.deepEqual(um.tokenize('深色'), ['深色'])
  assert.deepEqual(um.tokenize('深色主题'), ['深色', '色主', '主题'])
  assert.deepEqual(um.tokenize('深'), ['深'])
  assert.ok(um.tokenize('偏好深色主题').includes('深色'))
})

test('CASE tokenize-mixed', () => {
  const tokens = um.tokenize('提交信息用 git commit')
  assert.ok(tokens.includes('提交'))
  assert.ok(tokens.includes('信息'))
  assert.ok(tokens.includes('git'))
  assert.ok(tokens.includes('commit'))
  assert.ok(!tokens.some((t) => t.includes(' ')))
})

test('CASE tokenize-ascii-inner', () => {
  assert.deepEqual(um.tokenize('C++'), ['c++'])
  assert.deepEqual(um.tokenize('v0.1.0'), ['v0.1.0'])
  assert.deepEqual(um.tokenize('snake_case'), ['snake_case'])
  assert.deepEqual(um.tokenize('user-model'), ['user-model'])
})

test('CASE tokenize-empty', () => {
  assert.deepEqual(um.tokenize(''), [])
  assert.deepEqual(um.tokenize('   '), [])
  assert.deepEqual(um.tokenize('。，、！'), [])
})

test('CASE parse-roundtrip', () => {
  const text = um.renderEntry(sample())
  const parsed = um.parseEntry(text, '20261124-commit-lang.md')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.entry.title, '提交信息用中文')
  assert.equal(parsed.entry.body, '团队都用中文')
  assert.equal(parsed.entry.kind, 'decision')
  assert.equal(um.validateEntry(parsed.entry).ok, true)
})

test('CASE parse-missing-title', () => {
  const text = um.renderEntry(sample()).replace('title: 提交信息用中文\n', '')
  const parsed = um.parseEntry(text, '20261124-commit-lang.md')
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error, 'parse')
})

test('CASE parse-unknown-field', () => {
  const text = um.renderEntry(sample()).replace('kind: decision', 'kind: decision\nowner: nobody')
  const parsed = um.parseEntry(text, '20261124-commit-lang.md')
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error, 'parse')
})

test('CASE validate-id-mismatch', () => {
  const text = um.renderEntry(sample({ id: '20261124-other' }))
  const parsed = um.parseEntry(text, '20261124-commit-lang.md')
  assert.equal(parsed.ok, false)
  assert.equal(parsed.error, 'id mismatch')

  const wrongPrefix = um.parseEntry(um.renderEntry(sample({ date: '2026-11-25' })), '20261124-commit-lang.md')
  assert.equal(wrongPrefix.ok, false)
  assert.equal(wrongPrefix.error, 'id mismatch')
})

test('CASE validate-bad-kind', () => {
  const verdict = um.validateEntry(sample({ kind: 'opinion' }))
  assert.equal(verdict.ok, false)
  assert.equal(verdict.error, 'bad kind')
})

test('CASE validate-title-pipe', () => {
  assert.equal(um.validateEntry(sample({ title: 'a|b' })).error, 'bad title')
  assert.equal(um.validateEntry(sample({ title: '' })).error, 'bad title')
  assert.equal(um.validateEntry(sample({ title: 'x'.repeat(61) })).error, 'bad title')
  assert.equal(um.validateTitle('x'.repeat(60)).ok, true)
})

test('CASE validate-body-hr', () => {
  assert.equal(um.validateEntry(sample({ body: 'a\n---\nb' })).error, 'bad body')
  assert.equal(um.validateEntry(sample({ body: 'a|b' })).error, 'bad body')
  assert.equal(um.validateEntry(sample({ body: '' })).error, 'bad body')
  assert.equal(um.validateEntry(sample({ body: 'y'.repeat(401) })).error, 'bad body')
  assert.equal(um.validateBody('a\nb').ok, true)
})

test('CASE validate-future-date', () => {
  const entry = sample({ date: '2026-11-26', id: '20261126-x' })
  assert.equal(um.validateEntry(entry).ok, true)
  const verdict = um.validateEntry(entry, { today: '2026-11-25' })
  assert.equal(verdict.ok, false)
  assert.equal(verdict.error, 'future date')
})

test('CASE match-score-separator', () => {
  const split = sample({ title: '深', body: '色主题' })
  assert.equal(um.matchScore(split, um.tokenize('深色')), 0)
  const joined = sample({ title: '深色主题', body: '偏好' })
  assert.equal(um.matchScore(joined, um.tokenize('深色')), 1)
})

test('CASE rank-date-first', () => {
  const older = sample({ id: 'A', date: '2026-01-01', title: '提交 提交 提交', body: '提交' })
  const newer = sample({ id: 'B', date: '2026-06-01', title: '提交', body: '其它' })
  const tokens = um.tokenize('提交')
  const ranked = um.rank([older, newer], tokens)
  assert.equal(ranked[0].entry.id, 'B')
  assert.equal(ranked.length, 2)
})

test('CASE link-exclusive', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'um-test-'))
  try {
    const from = path.join(dir, 'from.md')
    const to = path.join(dir, 'to.md')
    fs.writeFileSync(from, 'x')
    fs.linkSync(from, to)
    // The second link is the exclusive-landing guarantee the writer relies on.
    assert.throws(() => fs.linkSync(from, to), (e) => e.code === 'EEXIST')
    assert.equal(fs.readFileSync(to, 'utf8'), 'x')
    // A hard link shares the inode, which is why the tmp is unlinked afterwards.
    assert.equal(fs.lstatSync(from).ino, fs.lstatSync(to).ino)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CASE format-no-match', () => {
  const lines = um.formatSearch({ root: 'R', library: 'ok', staged: 2, rows: [], total: 0, skipped: [] })
  assert.deepEqual(lines, ['# library: ok', '# root: R', '# staged: 2', '# no match', '# total: 0'])
})

test('CASE format-data-row', () => {
  const lines = um.formatSearch({
    root: 'R',
    library: 'ok',
    staged: 0,
    rows: [sample({ body: '第一行\n第二行' })],
    total: 4,
    skipped: ['broken.md'],
  })
  assert.equal(lines[3], '20261124-commit-lang | 2026-11-24 | decision | 提交信息用中文 | 第一行 第二行')
  assert.equal(lines[4], '# total: 4')
  assert.equal(lines[5], '# skipped: broken.md')
})

test('CASE slug-rule', () => {
  assert.equal(um.SLUG_RE.test('commit-lang'), true)
  assert.equal(um.SLUG_RE.test('a'), true)
  assert.equal(um.SLUG_RE.test('Bad_Slug'), false)
  assert.equal(um.SLUG_RE.test('1abc'), false)
  assert.equal(um.SLUG_RE.test('a'.repeat(42)), false)
})

test('CASE tokenize-fullwidth', () => {
  assert.deepEqual(um.tokenize('ａｂｃ'), ['abc'])
  assert.deepEqual(um.tokenize('深色 ＡＢＣ'), ['深色', 'abc'])
})

const mkroot = () => fs.mkdtempSync(path.join(os.tmpdir(), 'um-store-'))

test('CASE append-bad-calendar-date', () => {
  const root = mkroot()
  try {
    const base = { slug: 'cal', kind: 'fact', title: 't', body: 'b' }
    assert.equal(store.append(root, { ...base, date: '2026-02-31' }).error, 'error: bad date: 2026-02-31')
    assert.equal(store.append(root, { ...base, date: '2026-13-01' }).error, 'error: bad date: 2026-13-01')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('CASE land-exclusive', () => {
  const dir = mkroot()
  try {
    fs.writeFileSync(path.join(dir, 'x.md'), 'old')
    const result = store.land(dir, 'x.md', 'new', () => ({ ok: true }))
    assert.equal(result.ok, false)
    assert.equal(result.error, 'error: entry exists: x')
    assert.equal(fs.readFileSync(path.join(dir, 'x.md'), 'utf8'), 'old')
    assert.deepEqual(fs.readdirSync(dir), ['x.md'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('CASE approve-rejects-newline', () => {
  const root = mkroot()
  try {
    const staged = store.append(root, { slug: 'nl', kind: 'fact', title: '标题', body: '正文', date: '2026-11-24' })
    assert.equal(staged.ok, true)
    const result = store.approve(root, staged.id, 'user\n2026-11-24')
    assert.equal(result.ok, false)
    assert.equal(result.error, 'error: bad approved-by: contains a newline')
    assert.equal(store.stagedIds(root).length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

// ---- library that exists but has never been written to -------------------

// Regression: `library` used to be decided by the presence of entries/, which
// git cannot track when empty, so a freshly cloned library reported "missing" —
// the same answer as "this machine has no library at all".
test('CASE empty-library-is-not-missing', () => {
  const root = mkroot()
  try {
    assert.equal(fs.existsSync(path.join(root, 'entries')), false)
    const result = store.search(root, ['提交'])
    assert.equal(result.lines[0], '# library: ok')
    assert.ok(result.lines.includes('# no match'))
    assert.ok(result.lines.includes('# total: 0'))
    assert.equal(store.status(root).lines[0], 'library: ok')
    assert.equal(store.listAll(root).library, 'ok')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('CASE absent-library-is-missing', () => {
  const root = path.join(mkroot(), 'nope')
  try {
    assert.equal(store.search(root, ['提交']).lines[0], '# library: missing')
  } finally {
    fs.rmSync(path.dirname(root), { recursive: true, force: true })
  }
})

// ---- a real repository, because commit and push are part of the contract ---

// The commit path cannot be faked: `approve`, `edit`, `retire` and `restore` all
// end in `git push`, so the tests run against a throwaway repository with a
// local bare remote. No network, no credentials.
function mkRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'um-repo-'))
  const root = path.join(base, 'lib')
  const remote = path.join(base, 'remote.git')
  fs.mkdirSync(root)
  const run = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  run(base, ['init', '--bare', '-q', remote])
  run(root, ['init', '-q'])
  run(root, ['config', 'user.email', 'test@example.com'])
  run(root, ['config', 'user.name', 'test'])
  run(root, ['config', 'commit.gpgsign', 'false'])
  run(root, ['checkout', '-q', '-b', 'main'])
  fs.writeFileSync(path.join(root, '.gitignore'), 'entries/.pending/\nentries/*.tmp\n')
  fs.writeFileSync(path.join(root, 'README.md'), '# test library\n')
  run(root, ['add', '.'])
  run(root, ['commit', '-q', '-m', 'init'])
  run(root, ['remote', 'add', 'origin', remote])
  run(root, ['push', '-q', '-u', 'origin', 'main'])
  return { base, root }
}

test('CASE retire-hides-and-restore-brings-back', () => {
  const { base, root } = mkRepo()
  try {
    const staged = store.append(root, { slug: 'theme', kind: 'fact', title: '偏好深色主题', body: '界面用深色', date: '2026-11-24' })
    assert.equal(staged.ok, true)
    assert.equal(store.approve(root, staged.id, 'user, 2026-11-24').ok, true)

    const before = store.search(root, ['深色'])
    assert.equal(before.lines.filter((l) => l.startsWith('2026')).length, 1)

    const retired = store.retire(root, staged.id, '记错了')
    assert.equal(retired.ok, true, retired.error)
    assert.equal(fs.existsSync(path.join(root, 'entries', staged.id + '.md')), false)
    assert.equal(fs.existsSync(path.join(root, 'entries', '.retired', staged.id + '.md')), true)

    // The point of retire: the agent stops seeing it.
    assert.ok(store.search(root, ['深色']).lines.includes('# no match'))
    assert.equal(store.listAll(root).approved.length, 0)
    assert.equal(store.listAll(root).retired.length, 1)
    // ... and `check` must not call .retired/ a stray directory.
    assert.deepEqual(store.check(root), { ok: true, lines: [] })
    // ... and a second retire is a refusal, not a second move.
    assert.equal(store.retire(root, staged.id, '').error, 'error: already retired: ' + staged.id)

    assert.equal(store.restore(root, staged.id).ok, true)
    assert.equal(store.search(root, ['深色']).lines.filter((l) => l.startsWith('2026')).length, 1)
    assert.equal(store.dirtyCount(root), 0)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('CASE edit-rewrites-title-and-body-only', () => {
  const { base, root } = mkRepo()
  try {
    const staged = store.append(root, { slug: 'lang', kind: 'decision', title: '提交信息用英文', body: '旧内容', date: '2026-11-24' })
    store.approve(root, staged.id, 'user, 2026-11-24')

    const result = store.edit(root, staged.id, { title: '提交信息用中文', body: '团队都写中文' })
    assert.equal(result.ok, true, result.error)
    const shown = store.show(root, staged.id)
    assert.equal(shown.entry.title, '提交信息用中文')
    assert.equal(shown.entry.body, '团队都写中文')
    // Front matter survives: the date, kind and approval the user agreed to.
    assert.equal(shown.entry.date, '2026-11-24')
    assert.equal(shown.entry.kind, 'decision')
    assert.equal(shown.entry.approvedBy, 'user, 2026-11-24')
    assert.equal(store.dirtyCount(root), 0)

    // A no-op edit must not fabricate a commit.
    const again = store.edit(root, staged.id, { title: '提交信息用中文', body: '团队都写中文' })
    assert.deepEqual(again.lines, ['unchanged: ' + staged.id])

    // Validation still applies on the write path.
    assert.equal(store.edit(root, staged.id, { title: 'a|b' }).error, 'error: bad title: title contains |')
    assert.equal(store.edit(root, staged.id, { body: 'y'.repeat(401) }).error, 'error: bad body: body is 401 characters, max 400')
    assert.equal(store.edit(root, '20260101-missing', { title: 'x' }).error, 'error: unknown entry: 20260101-missing')
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('CASE history-spans-edit-and-retire', () => {
  const { base, root } = mkRepo()
  try {
    const staged = store.append(root, { slug: 'hist', kind: 'fact', title: '标题', body: '正文', date: '2026-11-24' })
    store.approve(root, staged.id, 'user, 2026-11-24')
    store.edit(root, staged.id, { body: '改过的正文' })
    store.retire(root, staged.id, '')

    const log = store.history(root, staged.id)
    assert.equal(log.ok, true)
    const all = log.lines.join('\n')
    assert.ok(all.includes('retire: ' + staged.id), all)
    assert.ok(all.includes('edit: ' + staged.id), all)
    assert.ok(all.includes('entry: ' + staged.id), all)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('CASE list-splits-the-three-states', () => {
  const { base, root } = mkRepo()
  try {
    const live = store.append(root, { slug: 'live', kind: 'fact', title: '生效的', body: 'a', date: '2026-11-24' })
    store.approve(root, live.id, 'user, 2026-11-24')
    const waiting = store.append(root, { slug: 'wait', kind: 'fact', title: '待批的', body: 'b', date: '2026-11-24' })
    const gone = store.append(root, { slug: 'gone', kind: 'fact', title: '要删的', body: 'c', date: '2026-11-24' })
    store.approve(root, gone.id, 'user, 2026-11-24')
    store.retire(root, gone.id, '')

    const listed = store.listAll(root)
    assert.deepEqual(listed.approved.map((e) => e.id), [live.id])
    assert.deepEqual(listed.staged.map((e) => e.id), [waiting.id])
    assert.deepEqual(listed.retired.map((e) => e.id), [gone.id])
    assert.deepEqual(listed.skipped, [])
    assert.equal(store.dirtyCount(root), 0)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

// ---- the HTTP face -------------------------------------------------------

test('CASE server-reads-and-retires', async () => {
  const { base, root } = mkRepo()
  let running
  try {
    const staged = store.append(root, { slug: 'http', kind: 'fact', title: '走 HTTP 的', body: '正文', date: '2026-11-24' })
    store.approve(root, staged.id, 'user, 2026-11-24')

    const { serve } = await import('../lib/server.mjs')
    running = await serve(root, { port: 0 })

    const page = await fetch(running.url)
    assert.equal(page.status, 200)
    assert.ok((await page.text()).includes('user-model'))

    const state = await (await fetch(running.url + 'api/state')).json()
    assert.equal(state.ok, true)
    assert.equal(state.approved.length, 1)
    assert.equal(state.dirty, 0)

    const edited = await (await fetch(running.url + 'api/edit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: staged.id, title: '改过的标题' }),
    })).json()
    assert.equal(edited.ok, true, edited.error)

    const retired = await (await fetch(running.url + 'api/retire', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: staged.id }),
    })).json()
    assert.equal(retired.ok, true, retired.error)

    // A non-JSON body is refused before any write happens: that is what stops a
    // foreign page from posting a simple form here.
    const form = await fetch(running.url + 'api/retire', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'id=' + staged.id,
    })
    assert.equal(form.status, 415)

    // A Host that is not this loopback port is DNS rebinding, not a local user.
    // fetch forbids setting Host (undici drops it), so this one is raw http.
    const reboundStatus = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: running.port,
        path: '/api/state',
        method: 'GET',
        headers: { host: 'example.test' },
      }, (res) => {
        res.resume()
        resolve(res.statusCode)
      })
      req.on('error', reject)
      req.end()
    })
    assert.equal(reboundStatus, 421)
  } finally {
    if (running) await running.close()
    fs.rmSync(base, { recursive: true, force: true })
  }
})
