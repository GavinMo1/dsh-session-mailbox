/**
 * Browser half of the history-message editor.
 *
 * The Harness Session log is the only source of truth and it is append-only, so a
 * historical user message is never rewritten in place. Editing one means copying
 * the prefix before it and prompting the rewritten text there. Two destinations
 * share that prefix copy:
 *   - branch: the child becomes a new branch and the original is untouched,
 *   - replace: the child inherits the original title and the original is archived,
 *     so the conversation appears to continue where the edited message was.
 *
 * The editing surface is the inline row replacement registered into
 * `conversation.chat.node`: every sent user message carries its own edit
 * control. The frame-wide panel (`shell.overlay`) is still mounted but has no
 * entry point since the header trigger was removed — keep it only as the
 * fallback implementation, it renders nothing while never opened.
 */
window.__ModuleLoader__.load({
  id: 'dsh-message-editor',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'messageEditor'

    /** Copy dictionary (Simplified Chinese). */
    const zh = {
      'panel.title': '编辑历史消息',
      'panel.intro': '选择一条已发送的消息进行改写。保存时有两种去处：新建分支会话（原会话保持不变），或直接改写原会话（从这条消息起截断后续内容，原会话自动归档）。',
      'panel.loading': '正在读取会话历史…',
      'panel.empty': '这个会话还没有可编辑的用户消息。',
      'panel.truncated': '历史较长，只列出了已加载的部分消息。',
      'panel.close': '关闭',
      'panel.listAria': '已发送的用户消息列表',
      'row.meta': '第 {n} 条 · {time}',
      'row.extras': '另含 {n} 项图片或文件内容，改写后不会带入',
      'row.edit': '编辑',
      'editor.cancel': '取消',
      'editor.save': '保存并分支继续',
      'editor.saving': '正在创建分支…',
      'editor.replace': '改写原会话',
      'editor.replacing': '正在改写…',
      'editor.hint': '分支：新建会话，原会话保留。改写原会话：从这里截断后续内容，原会话归档后由新会话接替。',
      'error.first': '这是会话中的第一条消息，之前没有可保留的历史，既不能分支也不能改写。',
      'error.empty': '内容不能为空。',
      'error.generic': '操作失败：{message}',
      'error.history': '读取会话历史失败：{message}',
      'inline.copy': '复制',
      'inline.copied': '已复制',
      'inline.edit': '编辑这条',
      'inline.preparing': '正在读取…',
      'inline.save': '保存并分支继续',
      'inline.saving': '正在创建分支…',
      'inline.replace': '改写原会话',
      'inline.replacing': '正在改写…',
      'inline.cancel': '取消',
      'inline.hint': '分支：原会话不变；改写原会话：原会话归档，由新会话接替',
      'inline.extras': '含 {n} 项图片或文件，改写不会带入',
      'inline.empty': '内容不能为空。',
      'inline.missing': '在会话历史里找不到这条消息。',
      'inline.failed': '操作失败：{message}',
      'pref.label': '行内编辑',
      'pref.hint': '在每条用户消息下方直接显示编辑按钮；关闭后只用本面板。',
      'pref.on': '已开启',
      'pref.off': '已关闭',
    }

    /** Copy dictionary (English). */
    const en = {
      'panel.title': 'Edit a history message',
      'panel.intro': 'Pick an earlier message and rewrite it. Saving has two destinations: a new branch session (the original stays untouched), or the original session itself (the history is cut after that message and the original is archived).',
      'panel.loading': 'Reading the session history…',
      'panel.empty': 'This session has no user message to edit yet.',
      'panel.truncated': 'The history is long, so only the loaded messages are listed.',
      'panel.close': 'Close',
      'panel.listAria': 'Sent user messages',
      'row.meta': '#{n} · {time}',
      'row.extras': 'Also holds {n} image or file part(s) that the rewrite will not carry',
      'row.edit': 'Edit',
      'editor.cancel': 'Cancel',
      'editor.save': 'Save and continue in a branch',
      'editor.saving': 'Creating the branch…',
      'editor.replace': 'Rewrite this session',
      'editor.replacing': 'Rewriting…',
      'editor.hint': 'Branch: a new session, the original stays. Rewrite: history is cut here, the original is archived and the new session takes its place.',
      'error.first': 'This is the first message of the session; there is no earlier history to branch from or rewrite.',
      'error.empty': 'The message cannot be empty.',
      'error.generic': 'Failed: {message}',
      'error.history': 'Could not read the session history: {message}',
      'inline.copy': 'Copy',
      'inline.copied': 'Copied',
      'inline.edit': 'Edit this message',
      'inline.preparing': 'Reading…',
      'inline.save': 'Save and continue in a branch',
      'inline.saving': 'Creating the branch…',
      'inline.replace': 'Rewrite this session',
      'inline.replacing': 'Rewriting…',
      'inline.cancel': 'Cancel',
      'inline.hint': 'Branch: the original stays. Rewrite: the original is archived and the new session takes its place',
      'inline.extras': 'Holds {n} image or file part(s) the rewrite will not carry',
      'inline.empty': 'The message cannot be empty.',
      'inline.missing': 'This message is not in the loaded history.',
      'inline.failed': 'Failed: {message}',
      'pref.label': 'Inline editing',
      'pref.hint': 'Show an edit control under every user message; turn off to use only this panel.',
      'pref.on': 'On',
      'pref.off': 'Off',
    }

    /** Plugin-owned stylesheet, inserted once and removed with the plugin effect. */
    const CSS = `

.dsh-me-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto;background:color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent)}
.dsh-me-panel{display:flex;flex-direction:column;width:min(720px,100%);max-height:min(78vh,760px);box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);box-shadow:0 18px 48px rgba(0,0,0,.28);overflow:hidden}
.dsh-me-head{display:flex;align-items:flex-start;gap:12px;padding:16px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-me-headMain{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1}
.dsh-me-title{margin:0;font-size:14px;line-height:20px;font-weight:600}
.dsh-me-intro{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-me-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:14px;line-height:1}
.dsh-me-close:hover,.dsh-me-close:focus-visible{background:var(--dsw-alias-fill-l1,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary)}
.dsh-me-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.dsh-me-status{margin:0;padding:24px 16px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-me-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
.dsh-me-list{flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;margin:0;padding:12px 16px 16px;overflow:auto;list-style:none;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsh-me-row{display:flex;flex-direction:column;gap:6px;box-sizing:border-box;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.dsh-me-rowHead{display:flex;align-items:center;gap:8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-me-index{flex:none;padding:0 5px;border-radius:var(--dsw-radius-xs,4px);background:var(--dsw-alias-fill-l2,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.dsh-me-time{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsh-me-text{margin:0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.dsh-me-extras{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-state-warn-primary)}
.dsh-me-rowActions{display:flex;justify-content:flex-end;gap:8px}
.dsh-me-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:28px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:18px}
.dsh-me-btn:hover,.dsh-me-btn:focus-visible{background:var(--dsw-alias-fill-l1,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary)}
.dsh-me-btn:disabled{cursor:default;opacity:.55}
.dsh-me-btnPrimary{border-color:transparent;background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dsh-me-btnPrimary:hover,.dsh-me-btnPrimary:focus-visible{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);opacity:.9}
.dsh-me-btnReplace{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}
.dsh-me-btnReplace:hover:not(:disabled),.dsh-me-btnReplace:focus-visible{background:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-bg-base)}
.dsh-me-editorBox{display:flex;flex-direction:column;gap:8px}
.dsh-me-editor{box-sizing:border-box;width:100%;min-height:112px;max-height:280px;resize:vertical;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:20px}
.dsh-me-editor:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dsh-me-hint{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsh-me-foot{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsh-me-footSpacer{flex:1}

.dsh-me-userRow{display:flex;flex-direction:column;align-items:flex-end;gap:6px;box-sizing:border-box;max-width:100%}
.dsh-me-userMeta{display:flex;align-items:center;justify-content:flex-end;gap:2px;padding-right:12px;color:var(--dsw-alias-label-tertiary)}
.dsh-me-userTime{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap;font-variant-numeric:tabular-nums}
.dsh-me-userButtons{display:inline-flex;align-items:center;gap:8px;opacity:0;transition:opacity 80ms}
.dsh-me-userRow:hover .dsh-me-userButtons,.dsh-me-userRow:focus-within .dsh-me-userButtons{opacity:1}
@media (hover:none){.dsh-me-userButtons{opacity:1}}
.dsh-me-iconBtn{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));display:inline-flex;align-items:center;justify-content:center;padding:6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.dsh-me-iconBtn svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}
.dsh-me-iconBtn:hover,.dsh-me-iconBtn:focus-visible{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14));color:var(--dsw-alias-label-secondary)}
.dsh-me-iconBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-me-editorWrap{display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:100%;max-width:min(calc(var(--dsh-chat-content-width,748px) * .702),82%);box-sizing:border-box}
.dsh-me-bubbleEditor{box-sizing:border-box;width:100%;min-height:72px;max-height:320px;resize:vertical;padding:10px 16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl,14px);background:var(--dsw-specific-bubble,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);font-family:inherit;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px))}
.dsh-me-bubbleEditor:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-me-inlineBar{display:flex;align-items:center;gap:8px;width:100%}
.dsh-me-inlineBarSpacer{flex:1}
.dsh-me-inlineNote{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);text-align:right}
.dsh-me-inlineError{margin:0;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary);text-align:right}

.dsh-me-pref{display:flex;align-items:center;gap:8px;margin-left:auto;flex:none}
.dsh-me-prefLabel{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}
.dsh-me-switch{position:relative;display:inline-flex;align-items:center;width:32px;height:18px;padding:0;border:0;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.28));cursor:pointer;transition:background 120ms}
.dsh-me-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dsh-me-switch::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform 120ms}
.dsh-me-switch[aria-checked="true"]::after{transform:translateX(14px)}
.dsh-me-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`
    /** Insert the plugin stylesheet and return its disposer. */
    function installStyles() {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-message-editor')
      tag.setAttribute('data-plugin-css', 'dsh-message-editor/editor.css')
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => {
        if (tag.parentNode !== null) tag.parentNode.removeChild(tag)
      }
    }

    /** Human-readable message of an unknown failure. */
    function messageOf(error) {
      if (error instanceof Error) return error.message
      if (typeof error === 'string') return error
      try {
        return JSON.stringify(error)
      } catch {
        return String(error)
      }
    }

    /** Local wall-clock label for one event time. */
    function formatTime(time) {
      const date = new Date(typeof time === 'number' ? time : Date.now())
      if (Number.isNaN(date.getTime())) return ''
      const pad = value => String(value).padStart(2, '0')
      return `${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /** Concatenate the text blocks of one durable user message. */
    function textOf(message) {
      const blocks = message !== null && typeof message === 'object' && Array.isArray(message.content) ? message.content : []
      const lines = []
      for (const block of blocks) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          lines.push(block.text)
        }
      }
      return lines.join('\n')
    }

    /**
     * Whether one durable user-role message is something the person typed.
     *
     * The Session log also carries user-ROLE messages the Harness injects for
     * the model — workspace instructions (AGENTS.md), goal rounds, plan
     * notices, skill catalogs, recalled session references. Those carry a
     * different `source.kind`, and the Host itself uses the same `"user"` tag
     * to recognize a real prompt, so they must never be listed as editable.
     * @param message - one durable message.
     * @returns true only for a person-authored turn.
     */
    function isUserSource(message) {
      const source = message !== null && typeof message === 'object' ? message.source : undefined
      return source !== null && typeof source === 'object' && source.kind === 'user'
    }

    /** Count the non-text blocks of one durable user message. */
    function extrasOf(message) {
      const blocks = message !== null && typeof message === 'object' && Array.isArray(message.content) ? message.content : []
      let count = 0
      for (const block of blocks) {
        if (block === null || typeof block !== 'object' || block.type !== 'text') count += 1
      }
      return count
    }

    /**
     * Split one durable message content into the shape the Chat content factory expects.
     * @param content - the message content blocks.
     * @returns text, image/file attachments, and the remaining blocks.
     */
    function contentParts(content) {
      const texts = []
      const attachments = []
      const rest = []
      const blocks = Array.isArray(content) ? content : []
      for (const block of blocks) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        } else if (block !== null && typeof block === 'object' && block.type === 'image' && block.attachment !== undefined) {
          attachments.push({ type: 'image', image: { attachment: block.attachment } })
        } else if (block !== null && typeof block === 'object' && block.type === 'file' && block.attachment !== undefined) {
          attachments.push({ type: 'file', file: block.attachment })
        } else {
          rest.push(block)
        }
      }
      return { text: texts.join(''), attachments, rest }
    }

    /**
     * Inline editing is always on.
     *
     * It used to be a preference whose only switch lived in the frame-wide
     * panel, and that panel was reachable only through the header trigger this
     * bundle no longer registers. A stored `off` would therefore leave the
     * person with no editing surface at all, so the preference is no longer
     * read; the panel's switch stays dormant with the panel.
     * @returns always true.
     */
    function readInlinePreference() {
      return true
    }

    /** Persist the inline-editing preference; storage failure keeps the in-memory value. */
    function writeInlinePreference(value) {
      try {
        window.localStorage.setItem('dsh-message-editor.inline', value ? 'on' : 'off')
      } catch {
        /* private mode or quota: the caller keeps its in-memory copy */
      }
    }

    /**
     * Read a Session's current durable title.
     * @param sessions - the Session Controller client service.
     * @param sessionId - Session to look up.
     * @returns the title, or undefined when the list has no row or no title yet.
     */
    function titleOf(sessions, sessionId) {
      try {
        const view = sessions.list.getSnapshot()
        const title = view === undefined || view === null ? undefined : view.byId?.[sessionId]?.title
        return typeof title === 'string' && title.trim() !== '' ? title : undefined
      } catch (cause) {
        // A readable list and an empty title are different failures; say which one.
        console.warn('[dsh-message-editor] could not read the Session list for the replacement title', cause)
        return undefined
      }
    }

    /**
     * Collect the durable user messages of an event window.
     * @param entries - the Session event window entries.
     * @returns one row per user message, in log order, with the seq just before it.
     */
    function collectUserMessages(entries) {
      const rows = []
      let previousSeq = null
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
        const event = entry.event
        if (event === null || typeof event !== 'object') continue
        if (event.type === 'user/message' && isUserSource(event.data)) {
          rows.push({
            key: String(event.seq),
            seq: event.seq,
            prevSeq: previousSeq,
            time: event.time,
            text: textOf(event.data),
            extras: extrasOf(event.data),
          })
        }
        previousSeq = event.seq
      }
      return rows
    }

    /**
     * Read a Session's loaded history, paging older entries until the window is complete.
     * @param sessions - the Client sessions service.
     * @param sessionId - Session to read.
     * @returns the user-message rows and whether older history stayed unloaded.
     */
    async function readHistory(sessions, sessionId) {
      const reference = sessions.retain(sessionId, { source: 'gateway' })
      try {
        const binding = await reference.ready
        const session = binding.session
        const source = binding.eventSource
        for (let page = 0; page < 80; page += 1) {
          const view = source.getSnapshot()
          if (view === undefined || !view.hasMore) break
          const before = view.entries.length
          await session.loadOlder()
          const after = source.getSnapshot()
          if (after === undefined || after.entries.length <= before) break
        }
        const view = source.getSnapshot()
        return {
          rows: collectUserMessages(view === undefined ? [] : view.entries),
          truncated: view === undefined ? false : view.hasMore === true,
        }
      } finally {
        reference.release()
      }
    }

    /**
     * Find one user-message row inside an already-loaded event window.
     */
    function rowInEntries(entries, seq) {
      return collectUserMessages(entries).find(row => row.seq === seq)
    }

    /**
     * Resolve a row from the loaded window only; never pages older history.
     */
    async function rowAtLoaded(sessions, sessionId, seq) {
      const reference = sessions.retain(sessionId, { source: 'gateway' })
      try {
        const binding = await reference.ready
        const view = binding.eventSource.getSnapshot()
        if (view === undefined || !Array.isArray(view.entries)) return undefined
        return rowInEntries(view.entries, seq)
      } finally {
        reference.release()
      }
    }

    /**
     * Bounded fallback: page just far enough that the window covers `seq` (never drain to the
     * oldest event). Stops as soon as the window stops growing, so a concurrent loadOlder or an
     * in-flight jump cannot spin this loop; the caller then falls back to a full read.
     */
    async function rowAtThrough(sessions, sessionId, seq) {
      const reference = sessions.retain(sessionId, { source: 'gateway' })
      try {
        const binding = await reference.ready
        const session = binding.session
        const source = binding.eventSource
        const read = () => {
          const view = source.getSnapshot()
          return {
            row: view === undefined ? undefined : rowInEntries(view.entries, seq),
            hasMore: view === undefined ? false : view.hasMore === true,
            count: view === undefined ? 0 : view.entries.length,
          }
        }
        let state = read()
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (state.row !== undefined && state.row.prevSeq != null) return state.row
          if (!state.hasMore || typeof session.loadThrough !== 'function') break
          const before = state.count
          try {
            await session.loadThrough(seq)
          } catch (cause) {
            console.warn('[dsh-message-editor] loadThrough failed, falling back', cause)
            break
          }
          state = read()
          if (state.row !== undefined && state.row.prevSeq != null) return state.row
          if (state.count === before) {
            // The jump loader can no-op while another page load is in flight; nudge once and,
            // if that still makes no progress, give up so the caller uses the full read.
            try {
              await session.loadOlder()
            } catch {
              break
            }
            const after = read()
            if (after.count === before) break
            state = after
          }
        }
        if (state.row !== undefined && state.row.prevSeq == null && state.hasMore) {
          // The target sits on the window's first entry: one more page supplies its predecessor.
          try {
            await session.loadOlder()
            state = read()
          } catch {
            /* the caller still gets a chance via the full read */
          }
        }
        // A null prevSeq here means the window never advanced (or this is the true first event);
        // let the caller's full read decide instead of reporting a false `first-message`.
        if (state.row !== undefined && state.row.prevSeq == null) return undefined
        return state.row
      } finally {
        reference.release()
      }
    }

    /**
     * Build the editor controller shared by the trigger and the overlay.
     * @param ctx - Client plugin context (slots, sessions, uiWorkspace).
     * @returns the observable store and the operations both entries call.
     */
    function createController(services) {
      let snapshot = {
        open: false,
        sessionId: undefined,
        status: 'idle',
        rows: [],
        error: undefined,
        truncated: false,
        inline: readInlinePreference(),
      }
      const listeners = new Set()
      let revision = 0

      const store = {
        getSnapshot() {
          return snapshot
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      }

      function publish(patch) {
        snapshot = Object.assign({}, snapshot, patch)
        for (const listener of Array.from(listeners)) listener()
      }

      /** Open the editor for one Session and load its user messages. */
      async function open(sessionId) {
        const run = (revision += 1)
        publish({ open: true, sessionId, status: 'loading', rows: [], error: undefined, truncated: false })
        try {
          const history = await readHistory(services.sessions(), sessionId)
          if (run !== revision) return
          publish({ status: 'ready', rows: history.rows, truncated: history.truncated })
        } catch (error) {
          if (run !== revision) return
          publish({ status: 'error', error: messageOf(error) })
        }
      }

      /** Close the editor and drop the loaded history. */
      function close() {
        revision += 1
        publish({ open: false, status: 'idle', rows: [], error: undefined, truncated: false })
      }

      /**
       * Fork before one historical message, open the child, and prompt the rewrite.
       *
       * Two destinations share the same prefix copy:
       *   - `fork` (default) leaves the original Session untouched and bumps its title,
       *   - `replace` makes the child stand in for the original: it inherits the title
       *     and the original is archived, so the sidebar keeps a single row and the
       *     conversation continues where the edited message used to be. The archived
       *     original is the undo path, since the Session log itself is append-only.
       * @param row - the row produced by `collectUserMessages`.
       * @param text - the rewritten message text.
       * @param sourceSessionId - the Session the row belongs to; defaults to the panel's Session.
       * @param mode - `'replace'` rewrites the Session in place; anything else branches.
       */
      async function save(row, text, sourceSessionId, mode) {
        const sessionId = sourceSessionId === undefined ? snapshot.sessionId : sourceSessionId
        if (sessionId === undefined) throw new Error('the editor is closed')
        if (row === undefined || row.prevSeq === null || row.prevSeq === undefined) {
          const error = new Error('no event precedes this message')
          error.code = 'first-message'
          throw error
        }
        const body = text.trim()
        if (body === '') {
          const error = new Error('empty message')
          error.code = 'empty'
          throw error
        }
        const replaces = mode === 'replace'
        let childId
        try {
          childId = await services.sessions().fork(
            replaces
              ? { sessionId, atSeq: row.prevSeq }
              : { sessionId, atSeq: row.prevSeq, increaseTitle: true },
          )
        } catch (cause) {
          const error = new Error(messageOf(cause))
          error.code = 'fork-failed'
          throw error
        }
        let opened = true
        try {
          services.workspace().openSession(childId)
        } catch {
          // Navigation is a convenience for a branch, but a replacement that the
          // window never switched to would leave the user editing the wrong Session.
          opened = false
        }
        if (replaces && !opened) {
          const error = new Error('the Session was created but the window could not switch to it')
          error.code = 'navigate-failed'
          throw error
        }
        const originalTitle = replaces ? titleOf(services.sessions(), sessionId) : undefined
        if (replaces && originalTitle !== undefined) {
          // Inheriting the title is what makes the child read as the same conversation.
          try {
            const renamed = await services.sessions().rename(childId, originalTitle)
            if (renamed !== undefined && renamed !== null && renamed.ok === false) {
              console.warn('[dsh-message-editor] the replacement session kept its own title', renamed.error)
            }
          } catch (cause) {
            console.warn('[dsh-message-editor] the replacement session kept its own title', cause)
          }
        }
        const reference = services.sessions().retain(childId, { source: 'gateway' })
        try {
          const binding = await reference.ready
          const result = await binding.session.prompt([{ type: 'text', text: body }], 'queue')
          if (result !== undefined && result !== null && result.ok === false) {
            const failure = result.error
            const error = new Error(failure !== undefined && failure !== null && typeof failure.message === 'string' ? failure.message : 'the prompt was rejected')
            error.code = 'prompt-failed'
            throw error
          }
        } finally {
          reference.release()
        }
        if (replaces) {
          // Archive last: the rewrite must already be in the replacement Session
          // before the only copy of the previous history leaves the sidebar.
          try {
            // `stopActivity` lets the archive land even if the original was mid-turn;
            // that turn is being superseded by this rewrite anyway.
            await services.workspace().archiveSession(sessionId, { stopActivity: true })
          } catch (cause) {
            // The edit stands; keep the two Sessions distinguishable instead of
            // leaving two rows with the same name.
            console.warn('[dsh-message-editor] the replaced session could not be archived', cause)
            if (originalTitle !== undefined) {
              try {
                await services.sessions().rename(sessionId, originalTitle + '（编辑前）')
              } catch {
                /* the rows simply stay同名; nothing else can be done here */
              }
            }
          }
        }
        close()
      }

      /**
       * Resolve one historical message by its Session event seq.
       *
       * The loaded window is tried first: an already-rendered message is in it, so a normal edit
       * costs zero `loadOlder` pages. Only when the window does not hold it do we page - just far
       * enough to cover `seq` - and only as a last resort drain the whole history.
       * @param sessionId - owning Session.
       * @param seq - the `user/message` event seq.
       * @returns the row, or undefined when the loaded history does not hold it.
       */
      async function rowAt(sessionId, seq) {
        try {
          const hit = await rowAtLoaded(services.sessions(), sessionId, seq)
          if (hit !== undefined && hit.prevSeq != null) return hit
        } catch (error) {
          console.warn('[dsh-message-editor] rowAtLoaded failed, falling back', error)
        }
        let row
        try {
          row = await rowAtThrough(services.sessions(), sessionId, seq)
        } catch (error) {
          console.warn('[dsh-message-editor] rowAtThrough failed, falling back', error)
          row = undefined
        }
        if (row !== undefined) return row
        return (await readHistory(services.sessions(), sessionId)).rows.find(candidate => candidate.seq === seq)
      }

      /** Resolve and save in one step for the inline editor (no panel history required). */
      async function saveInline(sessionId, seq, text, mode) {
        const row = await rowAt(sessionId, seq)
        if (row === undefined) {
          const error = new Error('this message is not in the loaded history')
          error.code = 'missing'
          throw error
        }
        await save(row, text, sessionId, mode)
      }

      /** Turn inline editing on or off and tell both entries. */
      function setInline(value) {
        const next = value === true
        writeInlinePreference(next)
        publish({ inline: next })
        return next
      }

      return { store, open, close, save, rowAt, saveInline, setInline, getInline: () => snapshot.inline }
    }

    /** Pencil glyph drawn with the inherited text color. */
    function PencilIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M10.6 2.6a1.4 1.4 0 0 1 2 0l.8.8a1.4 1.4 0 0 1 0 2L5.7 13.1 2.5 13.5l.4-3.2z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M9.4 3.8 12.2 6.6', stroke: 'currentColor', strokeWidth: 1.3 }),
      )
    }

    /** Copy glyph drawn with the inherited text color. */
    function CopyIcon() {
      return h(
        'svg',
        { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('rect', { x: 5.5, y: 5.5, width: 8, height: 8, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M10.5 3.6A1.6 1.6 0 0 0 8.9 2H3.6A1.6 1.6 0 0 0 2 3.6v5.3a1.6 1.6 0 0 0 1.6 1.6', stroke: 'currentColor', strokeWidth: 1.3 }),
      )
    }

    /**
     * One user message rendered in place with its own edit control.
     *
     * Only the shell is ours: the text, markdown, reference chips and image grid
     * still render through the host's `conversation.chat.user.content` factory,
     * so this stays visually identical to the shipped bubble.
     */
    function InlineUserMessage(props) {
      const { node, t } = props
      const [phase, setPhase] = React.useState('idle')
      const [savingMode, setSavingMode] = React.useState(null)
      // A ref, not `phase`: two clicks in one frame both read the old phase.
      const busyRef = React.useRef(false)
      const mountedRef = React.useRef(true)
      React.useEffect(() => () => {
        mountedRef.current = false
      }, [])
      const [draft, setDraft] = React.useState('')
      const [failure, setFailure] = React.useState(null)
      const [copied, setCopied] = React.useState(false)
      const editorRef = React.useRef(null)
      // Typing must not re-render this row: the textarea is uncontrolled and its live value
      // lives here. `draft` is only the seed handed to `defaultValue` when editing starts.
      const draftRef = React.useRef('')
      const data = node !== null && typeof node === 'object' && typeof node.data === 'object' && node.data !== null ? node.data : {}
      const text = textOf(data)
      const extras = extrasOf(data)
      const seq = typeof node.seq === 'number' ? node.seq : node.anchorSeq
      const editing = phase === 'editing' || phase === 'saving'
      // Injected user-role messages (AGENTS.md, goal/plan notices, skill
      // catalogs) share the user row but are not editable prompts: they stay
      // copyable, without the pencil.
      const editable = isUserSource(data)

      React.useEffect(() => {
        if (!copied) return undefined
        const timer = setTimeout(() => setCopied(false), 1200)
        return () => clearTimeout(timer)
      }, [copied])

      React.useEffect(() => {
        if (!editing) return undefined
        const element = editorRef.current
        if (element === null) return undefined
        element.focus()
        element.setSelectionRange(element.value.length, element.value.length)
        return undefined
      }, [editing])

      const copy = () => {
        if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return
        navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false))
      }

      const begin = async () => {
        setFailure(null)
        if (typeof seq !== 'number') {
          // No seq means this node cannot be rewritten; stay local (no history read).
          setFailure(t('inline.missing'))
          return
        }
        // Prefill from the node we are already rendering (same source as the bubble and copy),
        // so opening the editor costs no I/O at all.
        draftRef.current = text
        setDraft(text)
        setPhase('editing')
      }

      const commit = async mode => {
        if (busyRef.current) return
        // Uncontrolled: the live text is in the DOM, falling back to the ref after unmount.
        const value = editorRef.current !== null ? editorRef.current.value : draftRef.current
        if (value.trim() === '') {
          setFailure(t('inline.empty'))
          return
        }
        busyRef.current = true
        setPhase('saving')
        setSavingMode(mode)
        setFailure(null)
        try {
          await props.saveInline(props.sessionId, seq, value, mode)
          // The rewrite usually navigates away and unmounts this row. When it does
          // not, the editor must come back instead of staying stuck in 'saving'.
          if (mountedRef.current) {
            setPhase('idle')
            setSavingMode(null)
          }
        } catch (error) {
          if (!mountedRef.current) return
          const code = error !== null && typeof error === 'object' ? error.code : undefined
          setFailure(code === 'first-message'
            ? t('error.first')
            : code === 'missing' ? t('inline.missing') : t('inline.failed', { message: messageOf(error) }))
          setPhase('editing')
          setSavingMode(null)
        } finally {
          busyRef.current = false
        }
      }

      const parts = contentParts(data.content)
      const prepared = { text: parts.text, attachments: parts.attachments, extraBlocks: parts.rest }
      if (data.referenceLabels !== undefined) prepared.referenceLabels = data.referenceLabels
      const facts = {}
      if (data.referenceLabels !== undefined) facts.sessionLabels = data.referenceLabels
      if (data.skillNames !== undefined) facts.skillNames = data.skillNames

      // The shipped bubble is only shown when we are NOT editing, so never build it while
      // editing: rendering the host content slot is the expensive part of this row.
      const bubble = editing
        ? null
        : typeof props.renderFactorySlot === 'function'
          ? props.renderFactorySlot('conversation.chat.user.content', {
            content: prepared,
            loadImage: props.loadImage,
            facts,
            interactive: true,
          })
          : h('div', { className: 'dsh-me-bubbleEditor', style: { whiteSpace: 'pre-wrap' } }, parts.text)

      const editor = h(
        'div',
        { className: 'dsh-me-editorWrap' },
        h('textarea', {
          ref: editorRef,
          className: 'dsh-me-bubbleEditor',
          defaultValue: draft,
          disabled: phase === 'saving',
          spellCheck: false,
          // Uncontrolled on purpose: mirror the value into a ref instead of state, so a
          // keystroke costs no React render (and no host bubble render) at all.
          onChange: event => {
            draftRef.current = event.target.value
          },
        }),
        extras > 0 ? h('p', { className: 'dsh-me-inlineNote' }, t('inline.extras', { n: extras })) : null,
        h(
          'div',
          { className: 'dsh-me-inlineBar' },
          h('span', { className: 'dsh-me-inlineBarSpacer' }),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-me-btn',
              disabled: phase === 'saving',
              onClick: () => {
                setPhase('idle')
                setFailure(null)
              },
            },
            t('inline.cancel'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-me-btn dsh-me-btnReplace',
              disabled: phase === 'saving',
              onClick: () => void commit('replace'),
            },
            savingMode === 'replace' ? t('inline.replacing') : t('inline.replace'),
          ),
          h(
            'button',
            { type: 'button', className: 'dsh-me-btn dsh-me-btnPrimary', disabled: phase === 'saving', onClick: () => void commit('fork') },
            savingMode === 'fork' ? t('inline.saving') : t('inline.save'),
          ),
        ),
        h('p', { className: 'dsh-me-inlineNote' }, t('inline.hint')),
        failure === null ? null : h('p', { className: 'dsh-me-inlineError' }, failure),
      )

      const meta = h(
        'div',
        { className: 'dsh-me-userMeta' },
        h('time', { className: 'dsh-me-userTime' }, formatTime(data.time)),
        phase === 'preparing'
          ? h('span', { className: 'dsh-me-userTime' }, t('inline.preparing'))
          : h(
            'span',
            { className: 'dsh-me-userButtons' },
            h('button', { type: 'button', className: 'dsh-me-iconBtn', title: t('inline.copy'), 'aria-label': copied ? t('inline.copied') : t('inline.copy'), onClick: copy }, h(CopyIcon, null)),
            editable
              ? h('button', { type: 'button', className: 'dsh-me-iconBtn', title: t('inline.edit'), 'aria-label': t('inline.edit'), onClick: () => void begin() }, h(PencilIcon, null))
              : null,
          ),
      )

      return h(
        'div',
        { className: 'dsh-me-userRow' },
        editing ? editor : bubble,
        meta,
        failure !== null && !editing ? h('p', { className: 'dsh-me-inlineError' }, failure) : null,
      )
    }

    /** Frame-wide editing panel listing every sent user message. */
    function HistoryOverlay(props) {
      const state = props.useEditor(value => value)
      const [editing, setEditing] = React.useState(null)
      const [busy, setBusy] = React.useState(null)
      const [failure, setFailure] = React.useState(null)
      const listRef = React.useRef(null)
      const editorRef = React.useRef(null)
      // Synchronous guard: `busy` only flips on the next render, so a double click
      // in one frame would otherwise start two rewrites.
      const busyRef = React.useRef(false)
      /** Close only when no rewrite is in flight; a mid-flight close hides the outcome. */
      const requestClose = () => {
        if (busyRef.current) return
        props.close()
      }

      React.useEffect(() => {
        if (state.open) return undefined
        setEditing(null)
        setBusy(null)
        setFailure(null)
        return undefined
      }, [state.open])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          if (editing === null) {
            if (!busyRef.current) props.close()
          } else setEditing(null)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => {
          window.removeEventListener('keydown', onKeyDown)
        }
      }, [state.open, editing, props.close])

      React.useEffect(() => {
        if (editing === null) return
        const node = editorRef.current
        if (node === null) return
        node.focus()
        node.setSelectionRange(node.value.length, node.value.length)
      }, [editing === null ? null : editing.key])

      React.useEffect(() => {
        if (state.status !== 'ready' || editing !== null) return
        const node = listRef.current
        if (node === null) return
        node.scrollTop = node.scrollHeight
      }, [state.status, editing === null ? null : editing.key])

      if (!state.open) return null

      const beginEdit = row => {
        setFailure(null)
        setEditing({ key: row.key, text: row.text })
      }

      const commit = async mode => {
        if (editing === null || busyRef.current) return
        const row = state.rows.find(candidate => candidate.key === editing.key)
        if (row === undefined) return
        if (editing.text.trim() === '') {
          setFailure(props.t('error.empty'))
          return
        }
        busyRef.current = true
        setBusy(mode)
        setFailure(null)
        try {
          await props.save(row, editing.text, mode)
          setEditing(null)
        } catch (error) {
          if (error !== null && typeof error === 'object' && error.code === 'first-message') {
            setFailure(props.t('error.first'))
          } else {
            setFailure(props.t('error.generic', { message: messageOf(error) }))
          }
        } finally {
          busyRef.current = false
          setBusy(null)
        }
      }

      const body = []
      if (state.status === 'loading') {
        body.push(h('p', { key: 'loading', className: 'dsh-me-status' }, props.t('panel.loading')))
      } else if (state.status === 'error') {
        body.push(h('p', { key: 'error', className: 'dsh-me-status', 'data-tone': 'error' }, props.t('error.history', { message: state.error })))
      } else if (state.rows.length === 0) {
        body.push(h('p', { key: 'empty', className: 'dsh-me-status' }, props.t('panel.empty')))
      } else {
        const items = state.rows.map((row, index) => {
          const isEditing = editing !== null && editing.key === row.key
          return h(
            'li',
            { key: row.key, className: 'dsh-me-row' },
            h(
              'div',
              { className: 'dsh-me-rowHead' },
              h('span', { className: 'dsh-me-index' }, String(index + 1)),
              h('time', { className: 'dsh-me-time' }, formatTime(row.time)),
            ),
            isEditing
              ? h(
                  'div',
                  { className: 'dsh-me-editorBox' },
                  h('textarea', {
                    ref: editorRef,
                    className: 'dsh-me-editor',
                    value: editing.text,
                    disabled: busy,
                    spellCheck: false,
                    onChange: event => {
                      const next = event.target.value
                      setEditing(current => (current === null ? current : Object.assign({}, current, { text: next })))
                    },
                  }),
                  h('p', { className: 'dsh-me-hint' }, props.t('editor.hint')),
                  h(
                    'div',
                    { className: 'dsh-me-rowActions' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-me-btn',
                        disabled: busy,
                        onClick: () => {
                          setEditing(null)
                          setFailure(null)
                        },
                      },
                      props.t('editor.cancel'),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'dsh-me-btn dsh-me-btnReplace', disabled: busy !== null && busy !== undefined, onClick: () => void commit('replace') },
                      busy === 'replace' ? props.t('editor.replacing') : props.t('editor.replace'),
                    ),
                    h(
                      'button',
                      { type: 'button', className: 'dsh-me-btn dsh-me-btnPrimary', disabled: busy !== null && busy !== undefined, onClick: () => void commit('fork') },
                      busy === 'fork' ? props.t('editor.saving') : props.t('editor.save'),
                    ),
                  ),
                )
              : h(
                  'div',
                  { className: 'dsh-me-editorBox' },
                  h('p', { className: 'dsh-me-text' }, row.text === '' ? '…' : row.text),
                  row.extras > 0 ? h('p', { className: 'dsh-me-extras' }, props.t('row.extras', { n: row.extras })) : null,
                  h(
                    'div',
                    { className: 'dsh-me-rowActions' },
                    h('button', { type: 'button', className: 'dsh-me-btn', onClick: () => beginEdit(row) }, props.t('row.edit')),
                  ),
                ),
          )
        })
        body.push(h('ul', { key: 'list', ref: listRef, className: 'dsh-me-list', 'aria-label': props.t('panel.listAria') }, items))
      }

      if (state.truncated) {
        body.push(h('p', { key: 'truncated', className: 'dsh-me-hint', style: { padding: '0 16px 12px' } }, props.t('panel.truncated')))
      }

      return h(
        'div',
        { className: 'dsh-me-backdrop', onMouseDown: event => { if (event.target === event.currentTarget) requestClose() } },
        h(
          'div',
          { className: 'dsh-me-panel', role: 'dialog', 'aria-modal': 'true', 'aria-label': props.t('panel.title') },
          h(
            'div',
            { className: 'dsh-me-head' },
            h(
              'div',
              { className: 'dsh-me-headMain' },
              h('h2', { className: 'dsh-me-title' }, props.t('panel.title')),
              h('p', { className: 'dsh-me-intro' }, props.t('panel.intro')),
            ),
            h(
              'div',
              { className: 'dsh-me-pref' },
              h('span', { className: 'dsh-me-prefLabel' }, props.t('pref.label')),
              h('button', {
                type: 'button',
                role: 'switch',
                className: 'dsh-me-switch',
                'aria-checked': state.inline ? 'true' : 'false',
                'aria-label': props.t('pref.label'),
                title: props.t('pref.hint'),
                onClick: () => props.setInline(!state.inline),
              }),
            ),
            h('button', { type: 'button', className: 'dsh-me-close', title: props.t('panel.close'), 'aria-label': props.t('panel.close'), onClick: () => requestClose() }, '✕'),
          ),
          h('div', { className: 'dsh-me-body' }, body),
          failure === null ? null : h('div', { className: 'dsh-me-foot' }, h('span', { 'data-tone': 'error', style: { color: 'var(--dsw-alias-state-error-primary)' } }, failure)),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const services = {
          sessions() {
            const value = ctx.get('sessions')
            if (value === undefined) throw new Error('the sessions service is not available in this profile')
            return value
          },
          workspace() {
            const value = ctx.get('uiWorkspace')
            if (value === undefined) throw new Error('the uiWorkspace service is not available in this profile')
            return value
          },
        }
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-message-editor: dictionaries')
        ctx.effect(() => installStyles(), 'dsh-message-editor: styles')
        const controller = createController(services)
        let inlineHandle = () => {}
        const face = {
          hooks: { editor: controller.store },
          openEditor: sessionId => controller.open(sessionId),
          close: () => controller.close(),
          save: (row, text, mode) => controller.save(row, text, undefined, mode),
          rowAt: (sessionId, seq) => controller.rowAt(sessionId, seq),
          saveInline: (sessionId, seq, text, mode) => controller.saveInline(sessionId, seq, text, mode),
          setInline: value => {
            const next = controller.setInline(value)
            if (!registerInline()) return controller.setInline(!next)
            return next
          },
        }
        /**
         * (Re)register the user-row replacement. Disposing the previous injection
         * hands the shipped bubble back, so turning the preference off restores
         * stock behavior without a reload.
         */
        function registerInline() {
          const previous = inlineHandle
          inlineHandle = () => {}
          try {
            previous()
          } catch {
            /* the previous handle was already disposed */
          }
          if (!controller.getInline()) return true
          try {
            inlineHandle = ctx.slots.inject('conversation.chat.node', () =>
              ctx.slots.register(
                {
                  name: 'conversation.chat.node',
                  key: 'user',
                  // Lowest priority renders: a negative value shadows the shipped 0.
                  priority: -1,
                  locale: NS,
                  inject: () => face,
                },
                InlineUserMessage,
              ),
            )
            return true
          } catch (error) {
            // Nothing stays registered, so the shipped bubble returns; the caller reverts the preference.
            console.error('[dsh-message-editor] inline registration failed', error)
            return false
          }
        }
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'message-editor.panel',
              order: 60,
              locale: NS,
              inject: () => face,
            },
            HistoryOverlay,
          ),
        )
        registerInline()
      },
    }
  },
})
