#!/usr/bin/env node
// `um` — the only entry point that reads UM_HOME. The plugin never uses this
// file; it calls lib/store.mjs with a root it resolved from os.homedir().
import process from 'node:process'
import { cliRoot } from '../lib/paths.mjs'
import * as store from '../lib/store.mjs'

const USAGE = [
  'usage:',
  '  um search <keyword...>',
  '  um append --slug <slug> --kind <fact|decision> --title <title> --body <body> [--date YYYY-MM-DD]',
  '  um approve <id> --approved-by <who, when>',
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
