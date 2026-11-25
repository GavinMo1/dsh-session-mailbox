#!/usr/bin/env node
// `um` — the only entry point that reads UM_HOME. The plugin never uses this
// file; it calls lib/store.mjs with a root it resolved from os.homedir().
import process from 'node:process'
import { cliRoot } from '../lib/paths.mjs'
import * as store from '../lib/store.mjs'
import { dataLine, renderEntry } from '../lib/um.mjs'

const USAGE = [
  'usage:',
  '  um list',
  '  um show <id>',
  '  um search <keyword...>',
  '  um append --slug <slug> --kind <fact|decision> --title <title> --body <body> [--date YYYY-MM-DD]',
  '  um approve <id> --approved-by <who, when>',
  '  um flush --approved-by <who, when>',
  '  um edit <id> [--title <title>] [--body <body>]',
  '  um retire <id> [--reason <why>]',
  '  um restore <id>',
  '  um serve [--port <n>]',
  '  um sync',
  '  um check',
  '  um status',
].join('\n')

function parseFlags(argv) {
  const flags = {}
  const rest = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
        continue
      }
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined) {
        flags[key] = ''
      } else {
        flags[key] = next
        i++
      }
    } else {
      rest.push(a)
    }
  }
  return { flags, rest }
}

function done(result) {
  if (result.ok !== true) {
    process.stderr.write(result.error + '\n')
    process.exitCode = 1
    return
  }
  process.stdout.write(result.lines.join('\n') + '\n')
}

const [command, ...argv] = process.argv.slice(2)
const root = cliRoot()

if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
  process.stdout.write(USAGE + '\n')
} else if (command === 'list') {
  const listed = store.listAll(root)
  if (listed.ok !== true) {
    process.stderr.write(listed.error + '\n')
    process.exitCode = 1
  } else {
    const out = [
      'library: ' + listed.library,
      'root: ' + listed.root,
      'approved: ' + listed.approved.length,
      'staged: ' + listed.staged.length,
      'retired: ' + listed.retired.length,
    ]
    const section = (label, entries) => {
      if (entries.length === 0) return
      out.push('')
      out.push('-- ' + label)
      for (const entry of entries) out.push(dataLine(entry))
    }
    section('待批准', listed.staged)
    section('已生效', listed.approved)
    section('已删除', listed.retired)
    for (const name of listed.skipped) out.push('skipped: ' + name)
    process.stdout.write(out.join('\n') + '\n')
  }
} else if (command === 'show') {
  const result = store.show(root, argv[0])
  if (result.ok !== true) {
    process.stderr.write(result.error + '\n')
    process.exitCode = 1
  } else {
    process.stdout.write(renderEntry(result.entry))
  }
} else if (command === 'search') {
  done(store.search(root, argv.filter((a) => !a.startsWith('--'))))
} else if (command === 'append') {
  const { flags } = parseFlags(argv)
  done(store.append(root, {
    slug: flags.slug,
    kind: flags.kind,
    title: flags.title,
    body: flags.body,
    date: flags.date,
  }))
} else if (command === 'approve') {
  const { flags, rest } = parseFlags(argv)
  done(store.approve(root, rest[0], flags['approved-by']))
} else if (command === 'flush') {
  const { flags } = parseFlags(argv)
  done(store.flush(root, flags['approved-by']))
} else if (command === 'edit') {
  const { flags, rest } = parseFlags(argv)
  done(store.edit(root, rest[0], { title: flags.title, body: flags.body }))
} else if (command === 'retire') {
  const { flags, rest } = parseFlags(argv)
  done(store.retire(root, rest[0], flags.reason))
} else if (command === 'restore') {
  done(store.restore(root, argv[0]))
} else if (command === 'serve') {
  const { flags } = parseFlags(argv)
  const requested = flags.port === undefined ? 7326 : Number(flags.port)
  if (!Number.isInteger(requested) || requested < 0 || requested > 65535) {
    process.stderr.write('error: bad port: ' + flags.port + '\n')
    process.exitCode = 2
  } else {
    const { serve } = await import('../lib/server.mjs')
    const running = await serve(root, { port: requested })
    process.stdout.write('user-model: ' + running.url + '\n')
    process.stdout.write('root: ' + root + '\n')
    process.stdout.write('Ctrl+C to stop.\n')
  }
} else if (command === 'sync') {
  done(store.sync(root))
} else if (command === 'check') {
  const result = store.check(root)
  if (result.lines.length > 0) process.stdout.write(result.lines.join('\n') + '\n')
  process.exitCode = result.ok === true ? 0 : 1
} else if (command === 'status') {
  done(store.status(root))
} else {
  process.stderr.write('error: unknown command: ' + command + '\n' + USAGE + '\n')
  process.exitCode = 2
}
