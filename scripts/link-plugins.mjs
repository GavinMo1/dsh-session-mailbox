#!/usr/bin/env node
// Link every plugin in this repo into a DSH profile and keep its bundle list
// in sync. Idempotent: a second run changes nothing and says so.
//
//   node scripts/link-plugins.mjs --dry-run
//   node scripts/link-plugins.mjs --apply
//   node scripts/link-plugins.mjs --apply --profile "D:\other\.dsh\profiles\desktop"
//
// `link:` is deliberate: the profile reads this working tree, so upgrading is
// `git pull` plus a reload — no pnpm install, no version bump in the manifest.

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'

const repoRoot = resolve(import.meta.dirname, '..')
const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const dryRun = !apply || argv.includes('--dry-run')

const profileFlag = argv.indexOf('--profile')
const profileDir = profileFlag !== -1
  ? resolve(argv[profileFlag + 1] ?? '')
  : join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'profiles', 'desktop')

const fail = (message) => {
  console.error(`error: ${message}`)
  process.exit(1)
}

// --- discover plugins -------------------------------------------------------
const pluginsDir = join(repoRoot, 'plugins')
if (!existsSync(pluginsDir)) fail(`no plugins/ directory under ${repoRoot}`)

const found = []
for (const entry of readdirSync(pluginsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(pluginsDir, entry.name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail(`cannot parse ${manifestPath}: ${error.message}`)
  }
  if (typeof manifest.name !== 'string' || manifest.name === '') {
    fail(`${manifestPath} has no "name"`)
  }
  if (manifest.dsh?.bundle?.patch === undefined) {
    console.log(`skip ${entry.name}: no "dsh.bundle.patch", so it is not a bundle`)
    continue
  }
  found.push({ dirName: entry.name, name: manifest.name, dir })
}
if (found.length === 0) fail('no bundle plugins found')

// --- read the profile -------------------------------------------------------
const profileManifestPath = join(profileDir, 'package.json')
if (!existsSync(profileManifestPath)) fail(`no profile manifest at ${profileManifestPath}`)
const before = readFileSync(profileManifestPath, 'utf8')
let profile
try {
  profile = JSON.parse(before)
} catch (error) {
  fail(`cannot parse ${profileManifestPath}: ${error.message}`)
}
if (profile.dsh?.profile === undefined) fail(`${profileManifestPath} has no "dsh.profile"`)

const dependencies = profile.dependencies ?? {}
const bundles = profile.dsh.profile.bundles ?? []

// --- compute the desired state ---------------------------------------------
const changes = []
for (const plugin of found) {
  const wanted = `link:${plugin.dir.replaceAll('\\', '/')}`
  if (dependencies[plugin.name] !== wanted) {
    changes.push(`dependencies["${plugin.name}"]: ${dependencies[plugin.name] ?? '(absent)'} -> ${wanted}`)
  }
  if (!bundles.includes(plugin.name)) {
    changes.push(`dsh.profile.bundles: + "${plugin.name}"`)
  }
}

console.log(`repo:    ${repoRoot}`)
console.log(`profile: ${profileDir}`)
console.log(`plugins: ${found.map((p) => p.name).join(', ')}`)
console.log('')

if (changes.length === 0) {
  console.log('already linked; nothing to change.')
  process.exit(0)
}
console.log('planned changes:')
for (const change of changes) console.log(`  - ${change}`)

if (dryRun) {
  console.log('\ndry run: nothing written. Re-run with --apply to write and install.')
  process.exit(0)
}

// --- apply ------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
const backups = join(profileDir, 'backups')
mkdirSync(backups, { recursive: true })
const backupPath = join(backups, `package.json.bak-link-plugins-${stamp}`)
copyFileSync(profileManifestPath, backupPath)
console.log(`\nbacked up -> ${backupPath}`)
for (const lock of ['pnpm-lock.yaml']) {
  const from = join(profileDir, lock)
  if (existsSync(from)) {
    const to = join(backups, `${lock}.bak-link-plugins-${stamp}`)
    copyFileSync(from, to)
    console.log(`backed up -> ${to}`)
  }
}

const next = structuredClone(profile)
next.dependencies ??= {}
for (const plugin of found) next.dependencies[plugin.name] = `link:${plugin.dir.replaceAll('\\', '/')}`
const nextBundles = [...(next.dsh.profile.bundles ?? [])]
for (const plugin of found) if (!nextBundles.includes(plugin.name)) nextBundles.push(plugin.name)
next.dsh.profile.bundles = nextBundles

writeFileSync(profileManifestPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
console.log(`wrote ${profileManifestPath}`)

console.log('\nrunning pnpm install...')
// Windows ships pnpm as a .CMD shim, which node refuses to spawn without a
// shell (CVE-2024-27980). Pass one already-quoted command string instead of an
// args array: array + shell would concatenate unescaped arguments (DEP0190).
const pnpm = spawnSync(`pnpm --dir "${profileDir}" install`, { stdio: 'inherit', shell: true })
if (pnpm.status !== 0) {
  console.error(`\npnpm install failed (exit ${pnpm.status}). Restore with:`)
  console.error(`  Copy-Item "${backupPath}" "${profileManifestPath}" -Force`)
  process.exit(pnpm.status ?? 1)
}
console.log('\ndone. Restart DSH, or toggle each plugin off/on through plugin_manager.')
