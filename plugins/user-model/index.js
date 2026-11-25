import { createRequire } from 'node:module'
import { join } from 'node:path'
import z from '@deepseek-ai/schemastery'
import * as store from './lib/store.mjs'
import { pluginRoot } from './lib/paths.mjs'

export const name = 'user-model'
export const inject = ['tools', 'systemPrompt']

export const Config = z.object({})

const PROMPT = [
  'Call user_model_search before you ask the user anything, and before you choose among several reasonable ways to do something they may already have decided: naming, format, which tool, which workflow, what order.',
  'Query shape: pass 1 to 3 concrete content words, not a sentence. Results are ordered newest first; when several entries cover the same subject, the newest one is the answer.',
  'If the output has any "# skipped:" line, this read was incomplete: do not conclude the library lacks the fact, and report the skipped files.',
  'Record only when all three hold: (1) the user\'s own sentence carries durable force — 以后 / 今后 / 下次 / 别再 / 不要再 / 记住 / 统一 / 一律 / 默认 / 永远, or a refusal together with its reason, or the same request repeated across two different tasks; (2) it restates as "from now on, when Y, do Z" — and kind "fact" is only for identity-level traits such as profession, role, field of study, or a long-running constraint of schedule or body, never a current state or a mood; (3) user_model_search finds no newer entry on the same subject.',
  'Do not record: the requirements of the task at hand, a one-off choice, a temporary constraint, a mood, or your own guess. Leaving something out costs the user one sentence later; a false entry costs an approval prompt every session, which is worse.',
  'Recording is two steps: user_model_append stages an entry and returns its id; user_model_approve makes it searchable, and only the user\'s own words authorize it. Stage at most one entry per session while one is still unapproved.',
  'There is no "replaced" flag: to change an earlier decision, record a new entry; the newer date wins.',
].join('\n')

export function apply(ctx) {
  // The anchor has to come from the profile context: DSH_INSTALL_DIR is a
  // per-execution shell variable and does not exist in the Host process.
  const fromProfile = ctx.get('profileContext')?.installAnchor
  const anchor = (typeof fromProfile === 'string' && fromProfile !== '')
    ? fromProfile
    : (typeof process.env.DSH_INSTALL_DIR === 'string' && process.env.DSH_INSTALL_DIR !== ''
      ? join(process.env.DSH_INSTALL_DIR, 'package.json')
      : undefined)
  if (anchor === undefined) {
    throw new Error('user-model cannot locate the installation anchor: neither profileContext.installAnchor nor DSH_INSTALL_DIR is available')
  }
  const hostRequire = createRequire(anchor)
  const { defineTool } = hostRequire('@deepseek-ai/dsh-tools')

  // Resolved once, from os.homedir() only. UM_HOME is a CLI affordance and must
  // never be able to point the live agent at a throwaway library.
  const root = pluginRoot()

  const textOutput = {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { text: { type: 'string', required: true } },
    },
    render: (_args, value) => [{ type: 'text', text: value.text }],
  }

  ctx.tools.register(defineTool({
    name: 'user_model_search',
    description: 'Search the user-model library: durable facts and decisions the user already stated. Call this before asking the user something they may already have answered, and before choosing among several reasonable ways to do something they may already have decided (naming, format, tool, workflow, order). Pass 1 to 3 concrete content words (CJK words and ASCII terms both work), not a sentence. Output lines beginning with "# " are metadata: "# library: ok|missing", "# root:", "# staged:", "# total:", "# skipped:", "# no match". Data lines are "<id> | <date> | <kind> | <title> | <body>", newest date first, at most 3. If any "# skipped:" line appears, the read was incomplete. If "# library: missing" appears, this machine has not synced the library yet.',
    parameters: {
      keywords: {
        type: 'array',
        items: { type: 'string' },
        required: true,
        description: 'One to three concrete content words. Not a sentence, not a question.',
      },
    },
    isConcurrencySafe: () => true,
    output: textOutput,
    async execute(args) {
      const list = Array.isArray(args.keywords) ? args.keywords.map(String) : []
      const result = store.search(root, list)
      if (result.ok !== true) throw new Error(result.error)
      return { text: result.lines.join('\n') }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'user_model_append',
    description: 'Stage one entry in the user-model library and return its id. A staged entry is NOT searchable until user_model_approve is called with that id. Stage only when all three hold: the user\'s own sentence carries durable force (以后 / 今后 / 下次 / 别再 / 不要再 / 记住 / 统一 / 一律 / 默认 / 永远, or a refusal with its reason, or the same request repeated across two different tasks); it restates as "from now on, when Y, do Z"; and user_model_search finds no newer entry on the same subject. Never stage the task at hand, a one-off choice, a temporary constraint, a mood, or your own guess. Stage at most one entry per session while one is still unapproved. slug is a short kebab-case name you choose (a-z, digits, dashes). title is one line, at most 60 characters. body is at most 400 characters and may contain newlines. kind is "fact" for an identity-level trait (profession, role, field of study, a long-running constraint of schedule or body), "decision" for something that was decided.',
    parameters: {
      slug: { type: 'string', required: true, description: 'Short kebab-case identifier, a-z, digits and dashes, at most 41 characters.' },
      kind: { type: 'string', required: true, enum: ['fact', 'decision'], description: 'fact for a stable trait or preference; decision for something that was decided.' },
      title: { type: 'string', required: true, description: 'One line, at most 60 characters, no "|", no newline.' },
      body: { type: 'string', required: true, description: 'At most 400 characters, may contain newlines, no "|", no line equal to ---.' },
      date: { type: 'string', description: 'YYYY-MM-DD; defaults to today. Must not be later than tomorrow.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { id: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: 'staged: ' + value.id }],
    },
    async execute(args) {
      const result = store.append(root, {
        slug: args.slug,
        kind: args.kind,
        title: args.title,
        body: args.body,
        date: args.date,
      })
      if (result.ok !== true) throw new Error(result.error)
      return { id: result.id }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'user_model_approve',
    description: 'Make a staged user-model entry searchable, then commit and push it. Call it only with an id returned by user_model_append, and only after the user has said in their own words that this entry should be kept. approvedBy records who approved and when, for example "user, 2026-11-24". If it reports "commit failed" or "push failed", the entry is already on disk and readable locally: report that to the user and run `um sync` later instead of appending again.',
    parameters: {
      id: { type: 'string', required: true, description: 'The id returned by user_model_append.' },
      approvedBy: { type: 'string', required: true, description: 'Who approved it and when, e.g. "user, 2026-11-24". Free text, written into the entry.' },
    },
    output: textOutput,
    async execute(args) {
      const result = store.approve(root, args.id, args.approvedBy)
      if (result.ok !== true) throw new Error(result.error)
      return { text: result.lines.join('\n') }
    },
  }))

  ctx.systemPrompt.context({
    name: 'user:model',
    required: true,
    interpolate: false,
    order: ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION'),
    text: PROMPT,
  })
}
