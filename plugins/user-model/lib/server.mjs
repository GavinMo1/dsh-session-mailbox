// A loopback-only HTTP face over lib/store.mjs, for the human.
//
// It exists because the library had no way to *look* at itself: `um search`
// needs keywords and returns at most three rows, so the only complete view of
// the library was reading the directory by hand. Nothing here is on the agent's
// path — the three agent tools call store.mjs directly — so a page that is down
// or slow costs the agent nothing.
import fs from 'node:fs'
import http from 'node:http'
import * as store from './store.mjs'

const PAGE = fs.readFileSync(new URL('./page.html', import.meta.url))
const MAX_BODY = 256 * 1024

function send(res, status, body, type) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8')
  res.writeHead(status, {
    'content-type': type,
    'content-length': buf.length,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(buf)
}

const json = (res, status, value) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8')

// The server can write, so it must not answer a request that merely *appears*
// local. A Host header naming something other than this loopback port is the
// signature of DNS rebinding, and is refused before any route runs.
function hostAllowed(hostHeader, port) {
  const h = String(hostHeader ?? '')
  return h === '127.0.0.1:' + port || h === 'localhost:' + port || h === '[::1]:' + port
}

function originAllowed(origin, port) {
  if (origin === undefined || origin === null || origin === '') return true
  const o = String(origin)
  return o === 'http://127.0.0.1:' + port || o === 'http://localhost:' + port || o === 'http://[::1]:' + port
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('body larger than ' + MAX_BODY + ' bytes'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// A validation refusal is the caller's fault; a failed commit or push is not.
function statusFor(result) {
  if (result.ok === true) return 200
  const error = String(result.error ?? '')
  return /^error: (commit|push) failed/.test(error) ? 502 : 400
}

async function handle(root, req, res) {
  const port = req.socket.localPort
  if (!hostAllowed(req.headers.host, port)) return json(res, 421, { ok: false, error: 'bad host' })

  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const pathname = url.pathname

  if (req.method === 'GET' || req.method === 'HEAD') {
    if (pathname === '/' || pathname === '/index.html') return send(res, 200, PAGE, 'text/html; charset=utf-8')
    if (pathname === '/api/state') {
      const listed = store.listAll(root)
      if (listed.ok !== true) return json(res, 500, listed)
      return json(res, 200, { ...listed, dirty: store.dirtyCount(root) })
    }
    if (pathname === '/api/history') return json(res, 200, store.history(root, url.searchParams.get('id') ?? ''))
    return json(res, 404, { ok: false, error: 'not found' })
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' })
  if (!originAllowed(req.headers.origin, port)) return json(res, 403, { ok: false, error: 'bad origin' })
  // Requiring JSON means a form on another site cannot reach these routes with a
  // simple request; the browser has to preflight, and there is no CORS header.
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    return json(res, 415, { ok: false, error: 'content-type must be application/json' })
  }

  let payload
  try {
    const raw = await readBody(req)
    payload = raw.trim() === '' ? {} : JSON.parse(raw)
  } catch (e) {
    return json(res, 400, { ok: false, error: 'bad request: ' + ((e && e.message) || 'unreadable') })
  }
  const field = (key) => (payload !== null && typeof payload === 'object' ? payload[key] : undefined)

  switch (pathname) {
    case '/api/append':
      return json(res, 200, store.append(root, {
        slug: field('slug'),
        kind: field('kind'),
        title: field('title'),
        body: field('body'),
        date: field('date'),
      }))
    case '/api/edit':
      return json(res, 200, store.edit(root, field('id'), { title: field('title'), body: field('body') }))
    case '/api/approve': {
      const result = store.approve(root, field('id'), field('approvedBy'))
      return json(res, statusFor(result), result)
    }
    case '/api/retire': {
      const result = store.retire(root, field('id'), field('reason'))
      return json(res, statusFor(result), result)
    }
    case '/api/restore':
      return json(res, 200, store.restore(root, field('id')))
    default:
      return json(res, 404, { ok: false, error: 'not found' })
  }
}

export function createServer({ root }) {
  return http.createServer((req, res) => {
    handle(root, req, res).catch((e) => {
      if (!res.headersSent) json(res, 500, { ok: false, error: 'internal: ' + ((e && e.message) || 'unknown') })
      else res.end()
    })
  })
}

// Resolves once listening; `port` 0 asks the OS for a free one, which is how the
// tests avoid colliding with a page the human left open.
export function serve(root, { port = 7326, host = '127.0.0.1' } = {}) {
  const server = createServer({ root })
  return new Promise((resolve, reject) => {
    const onError = (e) => reject(e)
    server.once('error', onError)
    server.listen(port, host, () => {
      server.removeListener('error', onError)
      const address = server.address()
      const actual = typeof address === 'object' && address !== null ? address.port : port
      resolve({
        server,
        port: actual,
        url: 'http://' + host + ':' + actual + '/',
        close: () => new Promise((done) => server.close(() => done())),
      })
    })
  })
}
