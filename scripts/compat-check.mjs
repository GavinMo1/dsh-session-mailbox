#!/usr/bin/env node
// compat-check.mjs — assert the host API this repo's Host-side plugins depend
// on, by reading the TypeScript sources shipped inside DSH's app.asar.
//
//   node scripts/compat-check.mjs                  # probe for the installed app.asar
//   node scripts/compat-check.mjs --asar <path>    # point at a specific app.asar
//   set DSH_INSTALL_DIR=... && node scripts/compat-check.mjs
//
// Exit codes:
//   0  64 assertions PASS — every host interface is still there, safe to upgrade
//   1  at least one FAIL or STALE — do not upgrade DSH, read the FAIL lines
//   2  usage error / app.asar not found or unreadable — the table was not run
//
// Reading goes through `node scripts/asar.mjs cat <asar> <entry>`; this file
// never parses the asar binary itself and imports nothing but `node:` builtins.

import { readFileSync, statSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..')
const ASAR_TOOL = path.join(HERE, 'asar.mjs')

let asarPath = ''

function exists(p) {
  try {
    statSync(p)
    return true
  } catch {
    return false
  }
}

function isFile(p) {
  try {
    return statSync(p).isFile()
  } catch {
    return false
  }
}

function locateFail() {
  console.error('compat: cannot locate app.asar')
  console.error('  set DSH_INSTALL_DIR=<the directory that holds resources/app.asar>')
  console.error('  node scripts/compat-check.mjs --asar <path to app.asar>')
  console.error("  node scripts/asar.mjs list <asarPath> 'dsh-agent/src/index\\.ts'")
  process.exit(2)
}

function probeCandidates() {
  const roots = []
  if (process.env.LOCALAPPDATA) roots.push(path.join(process.env.LOCALAPPDATA, 'Programs'))
  if (process.env.ProgramFiles) roots.push(process.env.ProgramFiles)
  const found = []
  for (const root of roots) {
    let names
    try {
      names = readdirSync(root)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.startsWith('DSH')) continue
      const candidate = path.join(root, name, 'resources', 'app.asar')
      if (!isFile(candidate)) continue
      try {
        found.push({ path: candidate, mtime: statSync(candidate).mtimeMs })
      } catch {
        /* unreadable candidate: ignore */
      }
    }
  }
  return found
}

function resolveAsar() {
  const argv = process.argv.slice(2)
  let candidate
  const flagAt = argv.indexOf('--asar')
  if (flagAt !== -1) {
    const value = argv[flagAt + 1]
    if (value === undefined || value === '') {
      console.error('compat: --asar needs a path')
      process.exit(2)
    }
    candidate = value
  } else {
    const positional = argv.find((a) => !a.startsWith('-'))
    if (positional !== undefined) candidate = positional
  }

  if (candidate !== undefined) {
    const abs = path.resolve(candidate)
    if (!exists(abs)) locateFail()
    if (!isFile(abs)) {
      console.error(`compat: asar path is not a file — ${abs}`)
      process.exit(2)
    }
    return abs
  }

  const installDir = process.env.DSH_INSTALL_DIR
  if (installDir !== undefined && installDir !== '') {
    if (exists(installDir)) {
      if (isFile(installDir)) return path.resolve(installDir)
      for (const rel of ['app.asar', path.join('resources', 'app.asar')]) {
        const p = path.join(installDir, rel)
        if (isFile(p)) return path.resolve(p)
      }
    }
  }

  if (process.platform === 'win32') {
    const hits = probeCandidates().sort((a, b) => b.mtime - a.mtime)
    if (hits.length > 0) {
      if (hits.length > 1) {
        console.log(`compat: ${hits.length} 个 app.asar 候选（按 mtime 倒序）：`)
        for (const hit of hits) console.log(`  ${new Date(hit.mtime).toISOString()}  ${hit.path}`)
        console.log(`compat: 用了最新的这个 — ${hits[0].path}`)
      }
      return hits[0].path
    }
  }

  locateFail()
}

function abortUnreadable(detail) {
  console.error(`compat: asar unreadable — ${detail}`)
  process.exit(2)
}

const entryCache = new Map()

function readEntry(entry) {
  if (entryCache.has(entry)) return entryCache.get(entry)
  const run = spawnSync(process.execPath, [ASAR_TOOL, 'cat', asarPath, entry], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  let result
  if (run.error !== undefined) {
    result = { status: 'error', detail: String(run.error.message ?? run.error) }
  } else if (run.status === 0) {
    const text = run.stdout ?? ''
    if (text.includes('\0')) {
      result = { status: 'error', detail: 'entry text contains NUL bytes (truncated or half-copied asar)' }
    } else {
      result = { status: 'ok', text, bytes: Buffer.byteLength(text, 'utf8') }
    }
  } else {
    const stderr = String(run.stderr ?? '')
    if (stderr.startsWith('not found:')) result = { status: 'missing' }
    else result = { status: 'error', detail: stderr.split(/\r?\n/)[0] || `asar.mjs exited ${run.status}` }
  }
  entryCache.set(entry, result)
  return result
}

function dshVersion() {
  const pkg = readEntry('package.json')
  if (pkg.status === 'error') abortUnreadable(String(pkg.detail).split(/\r?\n/)[0])
  if (pkg.status !== 'ok') return 'dsh <unknown>'
  try {
    const parsed = JSON.parse(pkg.text)
    if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string') return 'dsh <unknown>'
    return `dsh ${parsed.name} ${parsed.version}`
  } catch {
    return 'dsh <unknown>'
  }
}

// --- the assertion table ---------------------------------------------------
//
// pkg      host package
// entry    path inside the asar
// patterns assertions — ALL must hit, each `new RegExp(p)`, no flags
// region   optional [start anchor, stop anchor]; patterns are matched inside
// sites    where the plugins depend on it — [file, regex], line numbers resolved live
// means    what a failure means

const ASSERTIONS = [
  { id: 'A01', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['super\\(ctx, \'agents\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\', \'agents\'']],
    means: 'ctx.agents 服务消失：插件 inject 的 agents 缺失，list_sessions 无会话可取，整块功能静默失效' },
  { id: 'A02', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['get\\(id: SessionId\\): Agent \\| undefined(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.get\\(']],
    means: 'get 改名或换了参数：send_session_message 取不到目标 agent，投递前就抛错' },
  { id: 'A03', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/index.ts',
    patterns: ['list\\(\\): Agent\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.agents\\.list\\(\\)']],
    means: 'list 改名或变异步：list_sessions 与别名表拿不到任何会话' },
  { id: 'A04', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['export type AgentStatus = \'idle\' \\| \'running\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'status === \'running\'']],
    means: 'status 取值变了：pageStatus 把所有会话塌成 inactive，投递原语从 steer 退成 followup' },
  { id: 'A05', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    followup\\(message: UserMessage\\): void(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n    steer\\(message: UserMessage\\): void(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'target\\.followup\\(message\\)'], ['plugins/session-mailbox/index.js', 'target\\.steer\\(message\\)']],
    region: ['interface Agent \\{', '\\n  \\}'],
    means: '投递原语消失或改名：send_session_message 抛 TypeError，消息发不出去' },
  { id: 'A06', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['super\\(ctx, \'sessionController\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionController\'\\)']],
    means: 'sessionController 服务消失：create_session 与 rename_session 全部报「服务不可用」' },
  { id: 'A07', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'create\'\\)', 'create\\(request: SessionCreateRequest\\): Promise<SessionCreateValue>'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    means: 'create 不再是 create(request)：create_session 造不出会话' },
  { id: 'A08', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['@Remote\\(\'prompt\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'async prompt\\(request: SessionPromptRequest, signal: AbortSignal\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    means: 'prompt 的 signal 位置或 request 形状变了：create_session 的首条消息投递失败，且已建的会话留在那里' },
  { id: 'A09', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/index.ts',
    patterns: ['resolveAgent\\(sessionId: SessionId\\): Promise<ApiSessionAgentResult>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.resolveAgent\\(']],
    means: 'resolveAgent 签名变了或消失：rename_session 无法装载冷会话，冷会话改名全失败' },
  { id: 'A10', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['super\\(ctx, \'sessionTitle\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)']],
    means: 'sessionTitle 服务消失：list_sessions 的 title 列全变成 (untitled)，rename_session 报不可用' },
  { id: 'A11', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['get\\(session: Session\\): SessionTitleSnapshot \\| undefined(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'get 签名变了：标题读不出来，列表退回无标题' },
  { id: 'A12', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['rename\\(session: Session, title: string\\): SessionTitleSnapshot(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: 'rename 签名变了：rename_session 失效（用户钉住标题的能力丢失）' },
  { id: 'A13', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\'session/title\': SessionTitleEventData(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: '事件名或载荷变了：标题投影断流，get() 永远返回旧值或 undefined' },
  { id: 'A14', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['\\n  readonly maxTitleBytes: number(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    region: ['export interface Config \\{', '\\n\\}'],
    means: '公开 Config 失去 maxTitleBytes：超长标题不再被服务端拒绝，README 与工具描述的长度承诺落空' },
  { id: 'A15', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/index.ts',
    patterns: ['export class SessionTitleInvalidError extends Error(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'titles\\.rename\\(agent\\.session, args\\.title\\)']],
    means: '错误类消失：空标题与其它 rename 失败不再能按类型区分（插件目前原样透传 message，影响在报文的可解释性与 README 承诺）' },
  { id: 'A16', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['super\\(ctx, \'workspaceRegistry\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)'], ['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'workspaceRegistry 服务消失（还是 inject 的必填项）：插件整个 apply 失败，六个工具全没了' },
  { id: 'A17', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['async create\\(path: string, title\\?: string\\): Promise<Workspace>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.create\\(path\\)']],
    means: 'create 返回形状变了（例如 { workspace, created }）：entity.id 变成 undefined，随后的 registry.get(undefined) 让 create_session 报「workspace disappeared after the session was created」——是响的，但报文会把人引向错误方向' },
  { id: 'A18', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get\\(id: WorkspaceId\\): Workspace \\| undefined(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.get\\(entity\\.id\\)']],
    means: 'get 变了：create_session 的「会话已入账」闸门失效，可能报告成功却没挂上' },
  { id: 'A19', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['list\\(\\): Workspace\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'workspaceRegistry\'\\)\\.list\\(\\)']],
    means: 'list 变异步：list_workspaces 与 create_session 的默认工作区选择直接崩（.map 在 Promise 上）' },
  { id: 'A20', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['get archivedSessionIds\\(\\): readonly SessionId\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.workspaceRegistry\\.archivedSessionIds']],
    means: 'archivedSessionIds 消失：归档闸读不到集合，list_sessions 会把归档会话列成可投递，投递也失去拒绝依据' },
  { id: 'A21', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['archiveSession\\(sessionId: SessionId, options: ArchiveSessionOptions = \\{\\}\\): Promise<void>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'throw new WorkspaceActiveSessionError\\(sessionId, activity\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    means: 'archiveSession 的返回类型变了、或「运行中拒绝归档」的那个 throw 消失：archive_sessions 只看有没有抛错，会把「运行中被拒、实际没归档」报成 archived' },
  { id: 'A22', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['delete\\(id: WorkspaceId\\): Promise<boolean>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.delete\\(id\\)']],
    means: 'delete 不再返回 boolean（改成 void）：delete_workspaces 把每次成功都报成 skipped' },
  { id: 'A23', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['super\\(ctx, \'subagents\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'subagents\'\\)']],
    means: 'subagents 服务消失：create_session 拒绝一切调用（判为无法验证调用方身份）' },
  { id: 'A24', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/index.ts',
    patterns: ['rootOf\\(caller: Agent\\): Agent(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'subagents\\.rootOf\\(exec\\.agent\\)']],
    means: 'rootOf 签名变了：create_session 的 subagent 闸门直接取不到判定函数' },
  { id: 'A25', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/schema.ts',
    patterns: ['export function defineTool<'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 的源码声明消失：两个插件的全部工具都注册不上（A44 另锁运行时那一份）' },
  { id: 'A26', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['export \\* from \'./schema.ts\'\\r?\\n'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: 'defineTool 不再出现在包根的 src 汇总里（源码层的重导出约定变了；运行时那一份由 A44 锁）' },
  { id: 'A27', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['register\\(definition: ToolDefinition, options: ToolRegistrationOptions = \\{\\}\\): \\(\\) => void(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.tools\\.register\\('], ['plugins/user-model/index.js', 'ctx\\.tools\\.register\\(']],
    means: 'tools.register 签名变了：工具静默不注册，症状是「插件加载成功但一个工具都没有」' },
  { id: 'A28', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['export function createUserMessage<'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    means: 'createUserMessage 的源码声明消失：send_session_message 造不出 user 消息' },
  { id: 'A29', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/index.ts',
    patterns: ['export \\* from \'./message.ts\'\\r?\\n'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: 'createUserMessage 不再出现在包根的 src 汇总里（运行时那一份由 A45 锁）' },
  { id: 'A30', pkg: '@deepseek-ai/dsh',
    entry: 'node_modules/@deepseek-ai/dsh/src/profile-boot.ts',
    patterns: ['provide\\(\'profileContext\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    means: 'profileContext 不再挂上 Context：两个插件的 createRequire 锚点两条路都断，apply 直接抛错' },
  { id: 'A31', pkg: '@deepseek-ai/dsh-app-boot',
    entry: 'node_modules/@deepseek-ai/dsh-app-boot/src/profile-context.ts',
    patterns: ['\\n  readonly installAnchor: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor'], ['plugins/user-model/index.js', 'ctx\\.get\\(\'profileContext\'\\)\\?\\.installAnchor']],
    region: ['export interface ProfileContext \\{', '\\n\\}'],
    means: 'installAnchor 字段改名：同上，两个插件起不来' },
  { id: 'A32', pkg: '@deepseek-ai/dsh-session',
    entry: 'node_modules/@deepseek-ai/dsh-session/src/types.ts',
    patterns: ['\\n  readonly id: SessionId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly createdAt: number(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly cwd\\?: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly origin\\?: \'subagent\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly delegationDepth\\?: number(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.cwd'], ['plugins/session-mailbox/index.js', 'origin !== \'subagent\''], ['plugins/session-mailbox/index.js', 'session\\.header\\.origin === \'subagent\''], ['plugins/session-mailbox/lib/create.js', 'header\\.delegationDepth']],
    region: ['export interface SessionHeader \\{', '\\n\\}'],
    means: 'SessionHeader 字段改名、换类型或搬进嵌套对象：别名表、排序、cwd 列、delegationDepth 守卫与「顶层会话」判定全错（子代理会被当成顶层）' },
  { id: 'A33', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/message.ts',
    patterns: ['event\\.data\\.source\\.kind !== \'user\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: '聊天投影的非 user 分叉变了：relay 消息可能不再折叠成上下文行，甚至从对话里消失' },
  { id: 'A34', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['getContextOrder\\(name: PromptContextOrderName\\): number(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'context\\(context: PromptContext\\): \\(\\) => void(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'SUBAGENT_DELEGATION: 120,(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt.context 或 getContextOrder 变了：两段提示词挂不上，工具在模型侧完全没有说明' },
  { id: 'A35', pkg: '@deepseek-ai/schemastery',
    entry: 'node_modules/@deepseek-ai/schemastery/src/index.ts',
    patterns: ['export default Schema(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'natural\\(\\): Schema<number>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'from \'@deepseek-ai/schemastery\''], ['plugins/user-model/index.js', 'from \'@deepseek-ai/schemastery\'']],
    means: 'schemastery 默认导出或 z.natural 变了：两个插件的 Config 解析失败，apply 之前就崩' },
  { id: 'A36', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/index.ts',
    patterns: ['super\\(ctx, \'tools\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'inject = \\[\'tools\''], ['plugins/user-model/index.js', 'inject = \\[\'tools\'']],
    means: 'tools 服务键改名：插件 inject 的 tools 缺失，加载器静默跳过，十个工具一个都不在' },
  { id: 'A37', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['super\\(ctx, \'systemPrompt\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\('], ['plugins/user-model/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    means: 'systemPrompt 服务键改名：同上，提示词与工具注册一起消失' },
  { id: 'A38', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    readonly session: Session(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n    readonly status: AgentStatus(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'a\\.session\\.header\\.createdAt'], ['plugins/session-mailbox/index.js', 'pure\\.pageStatus\\(a\\.status\\)']],
    region: ['interface Agent \\{', '\\n  \\}'],
    means: 'Agent 的 session / status 字段改名或搬进嵌套对象：list_sessions 的 id/cwd/createdAt 与 running/inactive 全塌，投递原语判错' },
  { id: 'A39', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/types.ts',
    patterns: ['\\n  readonly path: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly title: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly sessionIds: readonly SessionId\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly id: WorkspaceId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'title: String\\(w\\.title\\)'], ['plugins/session-mailbox/index.js', 'workspacePath: String\\(entity\\.path\\)']],
    region: ['export interface Workspace \\{', '\\n\\}'],
    means: 'Workspace 实体字段改名：list_workspaces 打出 "undefined | undefined"，create_session 的默认工作区选择与 created 判定失去依据' },
  { id: 'A40', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\\n  readonly workspaceId\\?: WorkspaceId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'controller\\.create\\(']],
    region: ['export interface SessionCreateRequest \\{', '\\n\\}'],
    means: 'SessionCreateRequest.workspaceId 改名：create_session 传的 { workspaceId } 被忽略，会话落到默认位置或创建失败' },
  { id: 'A41', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\\n  readonly requestId: SessionRequestId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly mode: \'queue\' \\| \'steer\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly content: readonly PromptContentPart\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly sessionId: SessionId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await controller\\.prompt\\(']],
    region: ['export interface SessionPromptRequest \\{', '\\n\\}'],
    means: 'SessionPromptRequest 的 requestId / mode / content 改名：幂等键、排队语义或首条消息载荷失效' },
  { id: 'A42', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/types.ts',
    patterns: ['\\n  readonly title: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    region: ['export interface SessionTitleEventData \\{', '\\n\\}'],
    means: '标题事件载荷的 title 字段改名：titleOf 恒为 undefined，列表全变 (untitled)，rename 回显退回入参' },
  { id: 'A43', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/agent.ts',
    patterns: ['\\{ readonly agent: Agent \\}', '\\{ readonly error: ApiSessionAgentError \\}'],
    sites: [['plugins/session-mailbox/index.js', 'result\\.agent']],
    means: 'resolveAgent 的返回联合形状变了：rename_session 读不到 resolved.agent，每次改名都报「could not be loaded」' },
  { id: 'A44', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/lib/index.js',
    patterns: ['function defineTool\\([^)]{0,40}\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'export \\{[^}]*defineTool[^}]*\\}'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)'], ['plugins/user-model/index.js', 'hostRequire\\(.@deepseek-ai/dsh-tools.\\)']],
    means: '运行时（lib）不再导出 defineTool：hostRequire 解构出 undefined，apply 阶段抛 TypeError（这一条锁的是真正被执行的那份）' },
  { id: 'A45', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/lib/index.js',
    patterns: ['function createUserMessage\\([a-z]+\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'export \\{[^}]*createUserMessage[^}]*\\}'],
    sites: [['plugins/session-mailbox/index.js', 'hostRequire\\(.@deepseek-ai/dsh-llm.\\)']],
    means: '运行时（lib）不再导出 createUserMessage：send_session_message 造不出 user 消息' },
  { id: 'A46', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/continuation-messages.ts',
    patterns: ['\\n  readonly kind: \'agent-message\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly form: \'relay\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly senderSessionId: SessionId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'kind: \'agent-message\''], ['plugins/session-mailbox/lib/pure.js', 'form: \'relay\''], ['plugins/session-mailbox/lib/pure.js', 'senderSessionId: String\\(senderId\\)']],
    region: ['export interface AgentMessageSource \\{', '\\n\\}'],
    means: 'AgentMessageSource 不再是三键（kind/form/senderSessionId）：私有 kind 不在 assertSource 的 15 种白名单里，迁移时报 unclassified message source；少任一键则严格键校验抛 SessionFormatError，投递在中继消息构造处就断' },
  { id: 'A47', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/commands.ts',
    patterns: ['\'session/workspace-attach-failed\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', '\'session/workspace-attach-failed\'']],
    means: 'attach 失败的稳定错误码改名（两个 throw 点一起改才会红）：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现' },
  { id: 'A48', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/types.ts',
    patterns: ['\\n  readonly id: SessionId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'id: String\\(a\\.id\\)']],
    region: ['export interface Agent \\{', '\\n\\}'],
    means: 'Agent.id 消失：别名表、self 判定、messageSource 的发送者 id 全部变成字符串 "undefined"，投递指向错误会话' },
  { id: 'A49', pkg: '@deepseek-ai/dsh-agent',
    entry: 'node_modules/@deepseek-ai/dsh-agent/src/runtime-types.ts',
    patterns: ['\\n    agent\\?: Agent(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'text: \\(\\{ agent \\}\\)']],
    region: ['interface AssembleContext \\{', '\\n  \\}'],
    means: 'AssembleContext 不再带 agent：systemPrompt 的 text 回调用到 undefined，MAILBOX_PROMPT 静默变空串（模型再也不知道这些工具怎么用）' },
  { id: 'A50', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/chat/ContextBody.tsx',
    patterns: ['function relaySender\\(source: unknown\\): string \\| null(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'asRecord\\(source\\)\\?\\.\\[\'senderSessionId\'\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'case \'relay\':(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'senderSessionId: String\\(senderId\\)']],
    means: 'relay 行不再读 senderSessionId：中继消息退化成 opaque 上下文行，「来自会话 <id>」那行消失' },
  { id: 'A51', pkg: '@deepseek-ai/dsh-client-ui-chat',
    entry: 'node_modules/@deepseek-ai/dsh-client-ui-chat/src/client/conversation-nodes/event-projection.ts',
    patterns: ['KNOWN_FORMS: readonly KnownContextForm\\[\\] = \\[(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\'instructions\', \'catalog\', \'snapshot\', \'notice\', \'relay\', \'recall\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'form: \'relay\'']],
    means: 'KNOWN_FORMS 不再包含 relay：整条上下文事件的 form 判定失败，消息在聊天里被丢弃' },
  { id: 'A52', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/contracts.ts',
    patterns: ['\\n  readonly agent\\?: Agent(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly signal: AbortSignal(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'exec\\.signal']],
    region: ['export interface ToolExecutionInput \\{', '\\n\\}'],
    means: 'ToolExecutionInput 的 agent / signal 改名：exec.signal 丢失后首条消息不再随工具取消而中止（静默），exec.agent 丢失后 list_sessions 会把调用者自己列进去' },
  { id: 'A53', pkg: '@deepseek-ai/dsh-subagent',
    entry: 'node_modules/@deepseek-ai/dsh-subagent/src/manager.ts',
    patterns: ['rootOf\\(caller: Agent\\): Agent \\{(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'throw new SubagentError\\(\'subagent tree access requires the exact live caller\', \'UNAUTHORIZED\'\\)(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'return activation\\.root(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'return caller(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'subagents\\.rootOf\\(exec\\.agent\\)']],
    means: 'rootOf 的实现语义变了（签名不变）：create_session 的 subagent 闸门方向可能整体反转（全拒 → 全放），而签名断言看不见' },
  { id: 'A54', pkg: '@deepseek-ai/dsh-session-title',
    entry: 'node_modules/@deepseek-ai/dsh-session-title/src/types.ts',
    patterns: ['export interface SessionTitleSnapshot extends SessionTitleEventData \\{(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.get\\(\'sessionTitle\'\\)\\?\\.get\\(session\\)']],
    means: 'Snapshot 不再继承事件载荷：title 从快照上消失，titleOf 恒 undefined，列表全变 (untitled)、rename 回显退回入参（零报错）' },
  { id: 'A56', pkg: '@deepseek-ai/dsh-workspace',
    entry: 'node_modules/@deepseek-ai/dsh-workspace/src/index.ts',
    patterns: ['\\n  readonly stopActivity\\?: boolean(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'await registry\\.archiveSession\\(']],
    region: ['export interface ArchiveSessionOptions \\{', '\\n\\}'],
    means: 'ArchiveSessionOptions.stopActivity 改名或被搬走：archive_sessions 的 stop 选项静默失效，运行中的会话被拒并报成 failed' },
  { id: 'A55', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/types.ts',
    patterns: ['\'session/workspace-attach-failed\': \\{ readonly sessionId: SessionId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    means: 'attach 失败的 details.sessionId 改名：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现（用户重试可能造出重复会话）' },
  { id: 'A57', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/commands.ts',
    patterns: ['\\{ sessionId, workspaceId: workspace\\.id \\}'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    means: 'attach 失败时构造的 details 形状变了（声明还在但值不再带 sessionId）：create_session 只会报笼统的 create failed，已建好的会话 id 不再浮现（用户重试可能造出重复会话）' },
  { id: 'A58', pkg: '@deepseek-ai/dsh-tools',
    entry: 'node_modules/@deepseek-ai/dsh-tools/src/schema.ts',
    patterns: ['\\n  readonly name: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly description: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly parameters: S(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly output: \\{(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n    readonly schema: O(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n    render\\(args: InferArgs<S>(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n    presentationMeta\\?\\(args(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  isConcurrencySafe\\?\\(args(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'name: \'list_sessions\'']],
    region: ['export interface DefineToolOptions<S extends ParameterSchemaSpec, O extends ValueSchemaSpec> \\{', '\\n\\}'],
    means: 'DefineToolOptions 的字段改名：工具仍注册成功，但模型拿到的 schema 没有描述/没有 output 声明（工具成了无说明函数），零报错' },
  { id: 'A59', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/message.ts',
    patterns: ['\\n  readonly id: MessageId(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly content: readonly ContentBlock\\[\\](?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly source: MessageSource(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'createUserMessage\\(']],
    region: ['interface MessageBase \\{', '\\n\\}'],
    means: 'UserMessage 的 content/source 字段改名：createUserMessage 是盲透传，畸形消息照常投递，坏在接收方（模型收到空的中继消息）' },
  { id: 'A60', pkg: '@deepseek-ai/dsh-typert-protocol',
    entry: 'node_modules/@deepseek-ai/dsh-typert-protocol/src/remote-error.ts',
    patterns: ['readonly code: Code,(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', 'readonly details: RemoteErrorDetailsMap\\[Code\\],(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'error\\?\\.details\\?\\.sessionId']],
    region: ['export class RemoteError<', '\\n\\}'],
    means: 'RemoteError 的 details 属性改名：attach 失败的报文退回笼统的 create failed，已建好的会话 id 不再浮现（零报错）' },
  { id: 'A61', pkg: '@deepseek-ai/dsh-system-prompt',
    entry: 'node_modules/@deepseek-ai/dsh-system-prompt/src/index.ts',
    patterns: ['\\n  readonly name: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly order: number(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly text: string \\|(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly interpolate\\?: boolean(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  readonly required\\?: boolean(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'ctx\\.systemPrompt\\.context\\(']],
    region: ['export interface PromptContext \\{', '\\n\\}'],
    means: 'PromptContext 的字段改名：两段提示词要么挂不上、要么在可选运行时上下文被关掉时静默消失（工具照常注册，模型不知道该怎么用）' },
  { id: 'A62', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/types.ts',
    patterns: ['\\n  type: \'text\'(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))', '\\n  text: string(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'type: \'text\'']],
    region: ['export interface TextBlock \\{', '\\n\\}'],
    means: 'TextBlock 的 shape 变了（type/text 改名）：插件构造的 { type: \'text\', text } 变成畸形块，createUserMessage 盲透传 → 接收方拿到空的中继消息，插件零报错' },
  { id: 'A63', pkg: '@deepseek-ai/dsh-llm',
    entry: 'node_modules/@deepseek-ai/dsh-llm/src/types.ts',
    patterns: ['\'text\': TextBlock(?=[ \\t]*(?:(?:\\r?\\n)(?!\\s*[|&])|//|/\\*|[,;:(){}]|$))'],
    sites: [['plugins/session-mailbox/index.js', 'type: \'text\'']],
    region: ['export interface ContentBlockMap \\{', '\\n\\}'],
    means: 'ContentBlockMap 不再有 text 变体（键改名）：插件构造的 { type: \'text\', text } 不再是合法的 ContentBlock，createUserMessage 盲透传 → 接收方拿到畸形的中继消息，插件零报错' },
  { id: 'A64', pkg: '@deepseek-ai/dsh-api-session-controller',
    entry: 'node_modules/@deepseek-ai/dsh-api-session-controller/src/agent.ts',
    patterns: ['\'session/not-found\'', '\'session/agent-busy\'', '\'session/writer-held\'', '\'gateway/internal\'', '\\{ reason: \'use subagent delivery'],
    sites: [['plugins/session-mailbox/lib/pure.js', 'wakeFailureVerdict']],
    // v12 defect fix: this row carried region ['export type ApiSessionAgentError =', '\\n\\n'],
    // which ends at the blank line after that one-line type alias (137 bytes here) and so
    // excluded the 5th pattern — `{ reason: 'use subagent delivery …' }` lives in
    // `apiSessionSubagentOwnershipError` further down the same file. Widening the window is
    // not possible: the declarations in between would trip the 3b ownership check. Dropping
    // the region puts this row back on whole-entry matching; the patterns themselves are
    // unchanged (Decision 6: the anchor was wrong, not the interface).
    means: 'ApiSessionAgentError 的错误码或 subagent 归因串改名：冷会话投递失败的分类落到 internal，报文从「no live session matches / use send_message」退化成笼统失败（零报错）' },
]

// --- region windows --------------------------------------------------------

const DECLARATION_HEAD = /^(export\s+)?(default\s+|declare\s+|async\s+|abstract\s+)*(interface|type|class|const|let|function|enum|namespace|module)\s/

function countMatches(text, source) {
  const re = new RegExp(source, 'g')
  let n = 0
  let m
  while ((m = re.exec(text)) !== null) {
    n += 1
    if (m[0] === '') re.lastIndex += 1
  }
  return n
}

function windowOf(text, region) {
  const startSource = region[0]
  const stopSource = region[1]

  const startCount = countMatches(text, startSource)
  if (startCount !== 1) {
    return {
      ok: false,
      reason: startCount === 0
        ? `起锚匹配 0 次（要求恰好 1 次）: ${startSource}`
        : `起锚匹配 ${startCount} 次（要求恰好 1 次）: ${startSource}`,
    }
  }

  const startMatch = new RegExp(startSource).exec(text)
  const startAt = startMatch.index
  const afterStart = startAt + startMatch[0].length
  const stopMatch = new RegExp(stopSource).exec(text.slice(afterStart))
  if (stopMatch === null) return { ok: false, reason: `止锚在起锚之后找不到: ${stopSource}` }
  const endAt = afterStart + stopMatch.index + stopMatch[0].length

  const window = text.slice(startAt, endAt)

  const lineStart = text.lastIndexOf('\n', startAt) + 1
  const lead = text.slice(lineStart, startAt)
  const startIndent = lead.length - lead.trimStart().length

  const lines = window.split('\n')
  for (let i = 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trimStart()
    if (!DECLARATION_HEAD.test(trimmed)) continue
    const indent = lines[i].length - trimmed.length
    if (indent > startIndent) continue
    return { ok: false, reason: `块尾之后还有声明头: ${trimmed.slice(0, 40)}` }
  }

  return { ok: true, window, bytes: Buffer.byteLength(window, 'utf8') }
}

// --- site resolution -------------------------------------------------------

function siteHits(fileRel, source) {
  const abs = path.resolve(REPO_ROOT, fileRel)
  let text
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return null
  }
  const re = new RegExp(source)
  const hits = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (re.test(lines[i])) hits.push({ line: i + 1, text: lines[i].trim() })
  }
  return hits
}

function formatSite(fileRel, hits) {
  if (hits.length <= 3) return hits.map((h) => `${fileRel}:${h.line}  ${h.text}`).join(' | ')
  const lines = hits.slice(0, 3).map((h) => h.line).join(', ')
  return `${fileRel}:${lines}  ${hits[0].text} (+${hits.length - 3} more)`
}

function dependsFor(row) {
  const parts = []
  for (const [fileRel, source] of row.sites) {
    const hits = siteHits(fileRel, source)
    if (hits === null || hits.length === 0) continue
    parts.push(formatSite(fileRel, hits))
  }
  return parts.join(' | ')
}

// --- the table run ---------------------------------------------------------

function patternHits(text, source) {
  return new RegExp(source).test(text)
}

function runTable() {
  let pass = 0
  let fail = 0
  let stale = 0
  let undetermined = 0

  for (const row of ASSERTIONS) {
    const missingSites = []
    for (const [fileRel, source] of row.sites) {
      const hits = siteHits(fileRel, source)
      if (hits === null || hits.length === 0) missingSites.push({ fileRel, source })
    }
    if (missingSites.length > 0) {
      stale += 1
      console.log(`STALE ${row.id}  ${row.pkg}  ${row.entry}`)
      for (const item of missingSites) {
        console.log(`  site    : ${item.fileRel}  /${item.source}/  匹配不到`)
      }
      console.log('  means   : 断言表里这条的依赖点已过期；先修 sites 再谈 DSH')
      continue
    }

    const read = readEntry(row.entry)
    if (read.status === 'error') abortUnreadable(String(read.detail).split(/\r?\n/)[0])

    if (read.status === 'missing') {
      fail += 1
      undetermined += 1
      console.log(
        `FAIL ${row.id}  ${row.pkg}  ${row.entry}  entry missing（该构建可能不随包附源码；` +
        `用 node scripts/asar.mjs list ${asarPath} '${row.pkg}/' 确认）`,
      )
      continue
    }

    const text = read.text
    const bytes = read.bytes
    const empty = text.replace(/^\uFEFF/, '').trim() === ''

    let surface = `整个条目，${bytes} 字节`
    let windowText = text
    let regionError

    if (empty) {
      surface = `整个条目，${bytes} 字节（条目存在但为空）`
    } else if (row.region !== undefined) {
      const win = windowOf(text, row.region)
      if (win.ok) {
        windowText = win.window
        surface = `${row.region[0]}，${win.bytes} 字节`
      } else {
        regionError = win.reason
      }
    }

    if (regionError !== undefined) {
      fail += 1
      console.log(`FAIL ${row.id}  ${row.pkg}  ${row.entry}`)
      console.log(`  region  : ${regionError}`)
      console.log(`  depends : ${dependsFor(row)}`)
      console.log(`  means   : ${row.means}`)
      continue
    }

    const matched = []
    const missed = []
    for (const source of row.patterns) {
      if (patternHits(windowText, source)) matched.push(source)
      else missed.push(source)
    }

    if (missed.length === 0) {
      pass += 1
      console.log(`PASS ${row.id}  ${row.pkg}  ${row.entry}`)
      continue
    }

    fail += 1
    if (empty) undetermined += 1
    console.log(`FAIL ${row.id}  ${row.pkg}  ${row.entry}`)
    console.log(`  missing : ${missed.join(' + ')}`)
    console.log(`  depends : ${dependsFor(row)}`)
    console.log(`  means   : ${row.means}`)
    console.log(`  lines   : 断言 ${row.patterns.length} 条，命中 ${matched.length} 条（匹配面：${surface}）`)
  }

  return { pass, fail, stale, undetermined }
}

// --- main ------------------------------------------------------------------

asarPath = resolveAsar()
const version = dshVersion()
console.log(`asar: ${asarPath}  ${version}`)

for (const row of ASSERTIONS) {
  if (!Array.isArray(row.patterns) || row.patterns.length < 1 || !Array.isArray(row.sites) || row.sites.length < 1) {
    console.error(`compat: assertion table is malformed（第 ${row.id} 行）`)
    process.exit(2)
  }
}

const { pass, fail, stale, undetermined } = runTable()

let verdict
if (fail === 0 && stale === 0) {
  verdict = '全部依赖接口仍在，可以升级'
} else if (fail === 0 && stale > 0) {
  verdict = '哨兵的依赖表过期了：先按上面的 STALE 行修 sites，再谈 DSH'
} else if (fail === undetermined) {
  verdict = `哨兵无法判定：${undetermined} 行条目不存在或为空，不说明接口变了，也不说明插件会坏`
  if (stale > 0) verdict += `（另有 ${stale} 行 STALE：依赖表已过期，先修 sites）`
} else if (undetermined > 0 && undetermined < fail) {
  verdict = `（其中 ${undetermined} 行无法判定：条目不存在或为空）有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言`
  if (stale > 0) verdict += `（另有 ${stale} 行 STALE）`
} else {
  verdict = '有接口变了：先别升级 DSH，按上面的 FAIL 行改插件或改断言'
  if (stale > 0) verdict += `（另有 ${stale} 行 STALE）`
}

console.log(`compat: ${pass} PASS / ${fail} FAIL / ${stale} STALE（${ASSERTIONS.length} 条断言，${version}）— ${verdict}`)
process.exit(fail === 0 && stale === 0 ? 0 : 1)
