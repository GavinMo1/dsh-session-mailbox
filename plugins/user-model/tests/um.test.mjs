import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import * as um from '../lib/um.mjs'

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
