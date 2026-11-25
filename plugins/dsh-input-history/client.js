/**
 * Browser half of the composer input history.
 *
 * The Harness composer keeps a *draft* per Session but forgets everything it
 * has already accepted, so there is nothing to recall once a prompt is sent.
 * This plugin adds exactly that memory, per Session:
 *
 *   - a `conversation.input.left` entry (a small clock button) that opens the
 *     list of prompts sent in THIS Session and writes one back into the
 *     composer through the provided `inputActions.setDraft`,
 *   - an optional ArrowUp/ArrowDown recall that only ever fires while the
 *     draft is really empty, so it cannot fight the Lexical editor for normal
 *     caret movement,
 *   - recordings made from the Session journal: a durable `user/message`
 *     appended by a real composer send.
 *
 * v1.0.4 lets a recalled multi-line entry keep walking the history once the
 * caret reaches its first (ArrowUp) or last (ArrowDown) block, instead of
 * handing the arrows back to the editor for the whole entry.
 *
 * v1.0.3 fixes the recall loop. The previous version tracked the composer
 * draft in a local shadow ref that only changed when this plugin itself wrote
 * a draft, so it drifted away from reality after any send, manual clear,
 * failed-send restore or external `setDraft`. Every recall decision is now
 * taken from the published InputState (`draft`, `draftRev`, `phase`) instead:
 *
 *   - "is the draft empty?" is answered synchronously from the composer DOM
 *     (`textContent`), so it cannot lag one frame behind the editor;
 *   - "am I still walking the history?" is answered by the `draftRev`
 *     generation captured at write time. Any edit bumps it, which cancels the
 *     walk; the adopted text is always the published draft, so normalising
 *     differences (placeholder characters, CRLF, NFC/NFD) cannot stall it.
 *
 * Nothing shipped is shadowed: the entry sits beside the stock tool-row
 * controls, which keeps upgrade drift to a minimum.
 */
window.__ModuleLoader__.load({
  id: 'dsh-input-history',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'inputHistory'

    /** Copy dictionary (Simplified Chinese). */
    const zh = {
      'action.label': '输入历史',
      'action.title': '输入历史',
      'panel.title': '输入历史',
      'panel.hint': '点一条填回输入框；草稿为空时按 ↑ 也能召回。',
      'panel.empty': '这个会话还没有输入记录。',
      'panel.emptyFiltered': '没有匹配的记录。',
      'panel.search': '搜索输入历史',
      'panel.loading': '正在读取会话…',
      'panel.delete': '删除这条',
      'panel.clear': '清空历史',
      'panel.close': '关闭',
      'pref.label': '历史记忆',
      'pref.hint': '关闭后停止记录，↑/↓ 召回也不再生效。',
      'pref.on': '已开启',
      'pref.off': '已关闭',
      'error.seed': '读取会话历史失败：{message}',
      'time.unknown': '更早',
      'time.now': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
    }

    /** Copy dictionary (English). */
    const en = {
      'action.label': 'Input history',
      'action.title': 'Input history',
      'panel.title': 'Input history',
      'panel.hint': 'Pick an entry to fill the composer; when the draft is empty, ↑ recalls it too.',
      'panel.empty': 'This session has no recorded input yet.',
      'panel.emptyFiltered': 'No matching entry.',
      'panel.search': 'Search input history',
      'panel.loading': 'Reading the session…',
      'panel.delete': 'Delete this entry',
      'panel.clear': 'Clear history',
      'panel.close': 'Close',
      'pref.label': 'Input memory',
      'pref.hint': 'Turning this off stops recording and disables the ↑/↓ recall.',
      'pref.on': 'On',
      'pref.off': 'Off',
      'error.seed': 'Reading the session history failed: {message}',
      'time.unknown': 'Earlier',
      'time.now': 'Just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
    }

    /** Per-Session storage key prefix. */
    const STORAGE_PREFIX = 'dsh-input-history.v2:'
    /** Earlier key prefix, whose seeds could carry injected context. */
    const LEGACY_PREFIX = 'dsh-input-history.v1:'
    /** Message source the Host itself uses to mark a real user turn. */
    const USER_SOURCE = 'user'
    /** Preference key: recording plus arrow recall. */
    const PREF_KEY = 'dsh-input-history.enabled'
    /** Longest retained list per Session. */
    const MAX_ENTRIES = 100
    /** Entries above this count show the search field. */
    const SEARCH_THRESHOLD = 8
    /** How many renders a pending write may wait for its `draftRev` to move. */
    const PENDING_TICKS = 2

    /**
     * Characters the composer strips from a programmatic draft
     * (`REFERENCE_PLACEHOLDER_RE` in ui-conversation). Recorded and stored text
     * is cleaned with the same class so a recalled entry is byte-identical to
     * the published draft it produces.
     */
    const PLACEHOLDER_RE = /[\uE100-\uE11D\uFFFC]/gu
    /** Composer phases in which the editor refuses writes. */
    const BLOCKED_PHASES = new Set(['adjudicating', 'submitting'])

    const CSS = `
.dsh-ih-root{position:relative;display:inline-flex;align-items:center}
.dsh-ih-btn{corner-shape:round;width:28px;height:28px;display:grid;place-items:center;flex:none;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-ih-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.dsh-ih-btn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.dsh-ih-btn[data-off="true"]{opacity:.4}
.dsh-ih-btn:disabled{opacity:.4;cursor:default}
.dsh-ih-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-ih-panel{position:fixed;z-index:80;display:flex;flex-direction:column;max-height:min(420px,60vh);box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-specific-input-major,var(--dsw-alias-bg-overlay,#1f2023));box-shadow:var(--dsw-elevation-soft,0 8px 24px rgba(0,0,0,.35));color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden}
.dsh-ih-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 6px}
.dsh-ih-title{font-size:13px;font-weight:600}
.dsh-ih-close{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:2px 6px;border-radius:6px}
.dsh-ih-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-ih-search{margin:0 12px 6px;padding:5px 8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base,transparent);color:inherit;font:inherit;outline:none}
.dsh-ih-search:focus{border-color:var(--dsw-alias-brand-primary)}
.dsh-ih-list{overflow-y:auto;padding:2px 6px 6px;margin:0;list-style:none;min-height:0}
.dsh-ih-row{display:flex;align-items:flex-start;gap:8px;width:100%;box-sizing:border-box;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-ih-row:hover,.dsh-ih-row[data-active="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-ih-text{flex:1;min-width:0;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;word-break:break-word}
.dsh-ih-meta{flex:none;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;padding-top:2px}
.dsh-ih-del{flex:none;border:0;background:transparent;color:var(--dsw-alias-label-caption);cursor:pointer;border-radius:6px;padding:0 4px;font-size:14px;line-height:18px;opacity:0}
.dsh-ih-row:hover .dsh-ih-del,.dsh-ih-del:focus-visible{opacity:1}
.dsh-ih-del:hover{color:var(--dsw-alias-state-error-primary,#f2555a)}
.dsh-ih-empty{padding:14px 12px;color:var(--dsw-alias-label-tertiary);text-align:center}
.dsh-ih-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px 10px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-ih-pref{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dsh-ih-clear{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;padding:2px 6px;border-radius:6px}
.dsh-ih-clear:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-ih-clear:disabled{opacity:.4;cursor:default}
.dsh-ih-hint{padding:0 12px 8px;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}
.dsh-ih-switch{position:relative;display:inline-flex;align-items:center;width:32px;height:18px;padding:0;border:0;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.28));cursor:pointer;transition:background 120ms}
.dsh-ih-switch[aria-checked="true"]{background:var(--dsw-alias-brand-primary)}
.dsh-ih-switch::after{content:'';position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform 120ms}
.dsh-ih-switch[aria-checked="true"]::after{transform:translateX(14px)}
.dsh-ih-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
`

    /** Insert the plugin stylesheet and return its disposer. */
    function installStyles() {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-input-history')
      tag.setAttribute('data-plugin-css', 'dsh-input-history/history.css')
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

    /** Clean one recorded string the same way the composer cleans a draft. */
    function cleanText(value) {
      return typeof value === 'string' ? value.replace(PLACEHOLDER_RE, '').trim() : ''
    }

    /** Concatenate the text blocks of one durable user message. */
    function textOf(message) {
      const blocks = message !== null && typeof message === 'object' && Array.isArray(message.content) ? message.content : []
      const texts = []
      for (const block of blocks) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') texts.push(block.text)
      }
      return texts.join('\n')
    }

    /**
     * Whether one journal event is a prompt the user actually typed and sent.
     *
     * `source.kind === 'user'` alone is not enough: the Harness stamps that
     * kind on messages it injects on the user's behalf — plan-mode steers
     * (`dsh-plan-mode`), goal rounds, slash-command lifecycles — and none of
     * those are recallable input.
     *
     * `source.rpcId` is the discriminator. The composer mints it in
     * `beginSubmission()` and forwards it as `requestId`, and the Host folds it
     * into the logged source as `rpcId`, so only turns that went through a
     * real composer send carry one.
     */
    function isRealUserTurn(event) {
      if (event === null || typeof event !== 'object' || event.type !== 'user/message') return false
      const data = event.data
      if (data === null || typeof data !== 'object') return false
      const source = data.source
      if (source === null || typeof source !== 'object' || source.kind !== USER_SOURCE) return false
      if (typeof source.rpcId !== 'string' || source.rpcId === '') return false
      return cleanText(textOf(data)) !== ''
    }

    /** Read the stored preference; storage failure falls back to enabled. */
    function readPreference() {
      try {
        const raw = window.localStorage.getItem(PREF_KEY)
        return raw === null ? true : raw === 'on'
      } catch {
        return true
      }
    }

    /** Persist the preference; storage failure keeps the in-memory value. */
    function writePreference(value) {
      try {
        window.localStorage.setItem(PREF_KEY, value ? 'on' : 'off')
      } catch {
        /* private mode or quota: the caller keeps its in-memory copy */
      }
    }

    /** Read one Session's stored list; `null` means storage holds nothing usable. */
    function readList(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return null
      try {
        const raw = window.localStorage.getItem(STORAGE_PREFIX + sessionId)
        if (raw === null) return null
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return null
        const list = []
        for (const item of parsed) {
          if (item === null || typeof item !== 'object') continue
          // Cleaned here too: lists written before v1.0.3 could still hold the
          // composer's placeholder characters, which would break text
          // comparison during a walk.
          const text = cleanText(item.t)
          if (text === '') continue
          list.push({ t: text, at: typeof item.at === 'number' ? item.at : null })
        }
        return list
      } catch {
        return null
      }
    }

    /** Persist one Session's list, silently dropping storage failures. */
    function writeList(sessionId, list) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      try {
        window.localStorage.setItem(STORAGE_PREFIX + sessionId, JSON.stringify(list.slice(0, MAX_ENTRIES)))
      } catch {
        /* private mode or quota: the in-memory list stays authoritative this session */
      }
    }

    /** Drop one Session's stored list. */
    function clearList(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      try {
        window.localStorage.removeItem(STORAGE_PREFIX + sessionId)
      } catch {
        /* nothing to do: the in-memory state is cleared by the caller */
      }
    }

    /**
     * Drop a pre-v2 list for this Session. Those lists could contain injected
     * context (workspace instructions, goal and plan notices) captured by an
     * unfiltered seed; the list rebuilds from the filtered seed instead.
     */
    function clearLegacy(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      try {
        window.localStorage.removeItem(LEGACY_PREFIX + sessionId)
      } catch {
        /* storage unavailable: nothing to migrate */
      }
    }

    /** Relative wall-clock label for one entry. */
    function formatAge(at, t) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return t('time.unknown')
      const delta = Date.now() - at
      if (delta < 60_000) return t('time.now')
      if (delta < 3_600_000) return t('time.minutes', { n: Math.floor(delta / 60_000) })
      if (delta < 86_400_000) return t('time.hours', { n: Math.floor(delta / 3_600_000) })
      return t('time.days', { n: Math.floor(delta / 86_400_000) })
    }

    /**
     * Whether the caret sits on the first (`start`) or last (`end`) block of
     * the composer.
     *
     * A recalled multi-line entry keeps the arrow keys for vertical caret
     * movement; only at an edge may ArrowUp/ArrowDown leave the entry and
     * continue walking the history. A missing selection API means we cannot
     * tell, and blocking the walk would be the worse failure, so it reports an
     * edge and lets the recall continue.
     */
    function caretAtEdge(seat, edge) {
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
      if (selection === null) return true
      if (selection.rangeCount === 0 || selection.isCollapsed !== true) return false
      const anchor = selection.anchorNode
      if (anchor === null || !seat.contains(anchor)) return false
      const blocks = seat.children
      if (blocks.length === 0) return true
      // Caret parked between blocks (anchor is the composer root itself).
      if (anchor === seat) {
        const offset = selection.anchorOffset
        return edge === 'start' ? offset === 0 : offset >= blocks.length
      }
      const block = edge === 'start' ? blocks[0] : blocks[blocks.length - 1]
      return block.contains(anchor)
    }

    /**
     * Move keyboard focus into this composer's editor.
     * Scoped to the owning card so a second composer (subagent panel) is never
     * focused instead.
     */
    function focusComposer(scope) {
      const host = scope instanceof Element ? scope : document
      const editable = host.querySelector('[data-composer-input]')
      if (editable !== null && typeof editable.focus === 'function') editable.focus()
    }

    /** A cursor that is not walking anything. */
    function idleCursor() {
      return { index: -1, rev: -1, text: null, pending: false, ticks: 0 }
    }

    /** Small clock glyph used by the tool-row trigger. */
    function ClockIcon() {
      return h(
        'svg',
        { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 6, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', { d: 'M8 4.6V8l2.3 1.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    /**
     * Bind the published InputState into a ref the keydown handler can read.
     * `draft` is the authoritative composer text, `draftRev` its generation and
     * `phase` the submit-machine phase.
     */
    function useLiveInput(useInput) {
      const draft = useInput(state => state.draft)
      const rev = useInput(state => state.draftRev)
      const phase = useInput(state => state.phase)
      const live = React.useRef({ draft: '', rev: -1, phase: 'plain' })
      live.current = {
        draft: typeof draft === 'string' ? draft : '',
        rev: typeof rev === 'number' ? rev : -1,
        phase: typeof phase === 'string' ? phase : 'plain',
      }
      return live
    }

    /**
     * Entry point: the tool-row entry plus its history popover.
     *
     * The composer's write-side actions arrive through the standard provide
     * channel (`inputActions`); the stored list, the Session seeding and the
     * live recording feed (both journal-backed) come from this entry's own
     * `inject` face. Arrow recall additionally needs the session's `useInput`
     * hook; without it (an unusual mount) the panel still works, only the
     * arrows are inert.
     */
    function InputHistory(props) {
      if (typeof props.useInput !== 'function') return h(InputHistoryView, { ...props, live: null })
      return h(InputHistoryWithInput, props)
    }

    /** Mounts the InputState subscription and hands it to the view. */
    function InputHistoryWithInput(props) {
      const live = useLiveInput(props.useInput)
      return h(InputHistoryView, { ...props, live })
    }

    /** The tool-row entry: trigger, history popover and arrow recall. */
    function InputHistoryView(props) {
      const { inputActions, sessionId, t, seed, watch, live } = props
      const tr = typeof t === 'function' ? t : key => key

      const [enabled, setEnabled] = React.useState(readPreference)
      const [entries, setEntries] = React.useState(() => readList(sessionId) ?? [])
      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [active, setActive] = React.useState(0)
      const [seeding, setSeeding] = React.useState(false)
      const [notice, setNotice] = React.useState(null)
      const [anchor, setAnchor] = React.useState(null)

      const rootRef = React.useRef(null)
      const buttonRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const cursorRef = React.useRef(idleCursor())
      const clearedRef = React.useRef(false)
      const ownerRef = React.useRef(sessionId)

      // Adopt a pending write as soon as the published generation moves, and
      // adopt the *published* text rather than the string we asked for: the
      // composer may normalise it, and a mismatch must never stall the walk.
      if (live !== null) {
        const cursor = cursorRef.current
        if (cursor.pending) {
          const now = live.current
          const ours = now.rev === cursor.rev + 1 || (now.rev > cursor.rev && now.draft === cursor.text)
          if (ours) {
            cursorRef.current = { index: cursor.index, rev: now.rev, text: now.draft, pending: false, ticks: 0 }
          } else if (now.rev !== cursor.rev) {
            cursorRef.current = idleCursor()
          } else if (cursor.ticks >= PENDING_TICKS) {
            // The write never reached the store: drop the cursor instead of
            // leaving the walk permanently unborn.
            cursorRef.current = idleCursor()
          } else {
            cursorRef.current = { ...cursor, ticks: cursor.ticks + 1 }
          }
        }
      }

      // Recording follows the Session journal, not the composer machine.
      //
      // The composer cannot tell a send from a manual clear: an ordinary send
      // runs `SubmitMachine.onEnter` -> `beginDetached`, whose documented
      // contract is "mint an ordinary send that leaves the phase plain", so
      // the published InputState goes `plain` -> `plain` while `commitDraft`
      // empties the draft. A manual clear produces the exact same pair, so any
      // draft/phase edge either misses every ordinary send (what watching the
      // phase does) or records every clear.
      //
      // The journal has no such ambiguity: a send appends a durable
      // `user/message`, a clear appends nothing.
      React.useEffect(() => {
        if (!enabled) return undefined
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        if (typeof watch !== 'function') return undefined
        return watch(sessionId, rows => {
          setEntries(current => {
            const seen = new Set(current.map(entry => entry.t))
            const fresh = rows.filter(row => !seen.has(row.t) && seen.add(row.t) !== undefined)
            if (fresh.length === 0) return current
            return [...fresh.reverse(), ...current].slice(0, MAX_ENTRIES)
          })
        })
      }, [enabled, sessionId, watch])

      // Persistence follows the list instead of living inside state updaters,
      // which React may invoke more than once.
      React.useEffect(() => {
        if (ownerRef.current !== sessionId) return
        if (typeof sessionId !== 'string' || sessionId === '') return
        if (entries.length === 0) clearList(sessionId)
        else writeList(sessionId, entries)
      }, [entries, sessionId])

      // Seeding: an already-running Session shows its earlier prompts even
      // though this plugin was not installed when they were sent.
      //
      // This always runs, even when the stored list is non-empty: the stored
      // list only ever holds what this browser saw, while the journal behind
      // the seed holds everything. Rows already present are dropped by text,
      // so the merge is idempotent.
      React.useEffect(() => {
        cursorRef.current = idleCursor()
        clearedRef.current = false
        ownerRef.current = sessionId
        setOpen(false)
        setQuery('')
        setNotice(null)
        setSeeding(false)
        clearLegacy(sessionId)
        const stored = readList(sessionId)
        setEntries(stored ?? [])
        if (typeof sessionId !== 'string' || sessionId === '') return undefined
        if (typeof seed !== 'function') return undefined
        let cancelled = false
        setSeeding(true)
        seed(sessionId)
          .then(rows => {
            if (cancelled || clearedRef.current) return
            if (!Array.isArray(rows) || rows.length === 0) return
            setEntries(current => {
              const seen = new Set(current.map(entry => entry.t))
              const merged = [...current]
              for (const row of rows) {
                if (seen.has(row.t)) continue
                seen.add(row.t)
                merged.push(row)
              }
              return merged.slice(0, MAX_ENTRIES)
            })
          })
          .catch(error => {
            if (cancelled) return
            setNotice(tr('error.seed', { message: messageOf(error) }))
          })
          .finally(() => {
            if (!cancelled) setSeeding(false)
          })
        return () => {
          cancelled = true
        }
      }, [sessionId, seed])

      /**
       * Write one entry into the composer.
       *
       * Object identity of the cursor is captured *before* the write: `setDraft`
       * publishes synchronously inside a discrete editor update, so the render
       * triggered by that publish sees `pending` with the old generation and
       * adopts the new one. Writing the draft first and the cursor second would
       * invert that and lose the adoption.
       *
       * `index < 0` means the entry vanished between paint and click (a `watch`
       * append can push the oldest entry out of `MAX_ENTRIES`, and deleting a
       * row leaves stale closures); such a click writes the text but starts no
       * walk instead of throwing inside the slot.
       */
      const writeEntry = React.useCallback(
        (index, text, options) => {
          const target = typeof text === 'string' ? text : ''
          const focus = options !== undefined && options.focus === true
          const known = live !== null && Number.isInteger(index) && index >= 0 && entries[index] !== undefined
          if (!known) {
            inputActions.setDraft(target)
            if (focus) focusComposer(rootRef.current === null ? document : rootRef.current.closest('[data-composer-card]'))
            return
          }
          const now = live.current
          cursorRef.current = { index, rev: now.rev, text: target, pending: true, ticks: 0 }
          if (target !== now.draft) inputActions.setDraft(target)
          // Nothing to publish when the composer already holds that text
          // (`setDraft` early-returns): settle the cursor immediately so the
          // next ArrowUp continues instead of stalling.
          else cursorRef.current = { index, rev: now.rev, text: now.draft, pending: false, ticks: 0 }
          if (focus) focusComposer(rootRef.current === null ? document : rootRef.current.closest('[data-composer-card]'))
        },
        [entries, inputActions, live],
      )

      // Arrow recall. Interception is limited to an empty draft (entering the
      // history) or to the generation this plugin last wrote (walking it), so
      // caret movement inside a real draft is never touched.
      React.useEffect(() => {
        if (!enabled) return undefined
        if (live === null) return undefined
        const onKeyDown = event => {
          if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
          if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
          const target = event.target
          if (!(target instanceof Element)) return
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          // Only the text surface itself: the tool-row buttons (this plugin's
          // trigger included) keep their own key handling. `closest` also
          // covers the caret sitting inside a chip, whose own node is the
          // non-editable decorator.
          const seat = target.closest('[data-composer-input]')
          if (seat === null || seat.isContentEditable !== true) return
          // Menu mutual exclusion, scoped to this composer: a trigger menu in
          // another composer must not silence this one, and a missing card is
          // structural breakage, not a licence to query the whole document.
          const card = seat.closest('[data-composer-card]')
          if (card === null) return
          if (card.querySelector('[data-trigger-menu]') !== null) return
          const now = live.current
          if (BLOCKED_PHASES.has(now.phase)) return
          const current = entries
          if (current.length === 0) return

          const cursor = cursorRef.current
          const walking =
            !cursor.pending &&
            cursor.rev >= 0 &&
            cursor.text !== null &&
            now.rev === cursor.rev &&
            now.draft === cursor.text

          if (!walking) {
            // A pending write is not a draft the user typed: stay out of the
            // way and leave the cursor alone so the same-frame second press
            // does not clear it.
            if (cursor.pending) return
            cursorRef.current = idleCursor()
            if (event.key !== 'ArrowUp') return
            // Emptiness comes from the DOM, not the published state: it cannot
            // lag one frame behind the editor, and a chip or any leftover
            // glyph keeps the composer out of the way.
            if ((seat.textContent ?? '') !== '') return
            if (now.draft !== '') return
            writeEntry(0, current[0].t)
            event.preventDefault()
            event.stopPropagation()
            return
          }

          // Multi-line recalls keep the caret keys until the caret reaches an
          // edge: ArrowUp only leaves the entry from its first block, ArrowDown
          // only from its last block (otherwise walking would fight vertical
          // caret movement inside the recalled text).
          if (now.draft.includes('\n')) {
            if (!caretAtEdge(seat, event.key === 'ArrowUp' ? 'start' : 'end')) return
          }

          if (event.key === 'ArrowUp') {
            if (cursor.index + 1 < current.length) {
              writeEntry(cursor.index + 1, current[cursor.index + 1].t)
              event.preventDefault()
              event.stopPropagation()
            } else {
              event.preventDefault()
            }
            return
          }
          if (cursor.index <= 0) {
            inputActions.setDraft('')
            cursorRef.current = idleCursor()
            event.preventDefault()
            event.stopPropagation()
            return
          }
          writeEntry(cursor.index - 1, current[cursor.index - 1].t)
          event.preventDefault()
          event.stopPropagation()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [enabled, entries, inputActions, live, writeEntry])

      // Dismiss on outside press or Escape.
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = event => {
          const target = event.target
          if (!(target instanceof Node)) return
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          if (rootRef.current !== null && rootRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          setOpen(false)
        }
        const onResize = () => setOpen(false)
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('resize', onResize)
        return () => {
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('resize', onResize)
        }
      }, [open])

      /** Open the popover, anchoring it above the trigger. */
      const openPanel = React.useCallback(() => {
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect !== undefined) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 })
        setQuery('')
        setActive(0)
        setOpen(true)
      }, [])

      /** Write one entry into the composer and close. */
      const apply = React.useCallback(
        entry => {
          writeEntry(entries.indexOf(entry), entry.t, { focus: true })
          setOpen(false)
        },
        [entries, writeEntry],
      )

      /** Toggle the whole feature (recording + arrow recall). */
      const togglePreference = React.useCallback(() => {
        setEnabled(current => {
          const next = !current
          writePreference(next)
          if (!next) cursorRef.current = idleCursor()
          return next
        })
      }, [])

      /** Remove a single entry. */
      const removeEntry = React.useCallback(index => {
        setEntries(current => {
          const next = current.filter((_, at) => at !== index)
          if (next.length === 0) clearedRef.current = true
          return next
        })
      }, [])

      // The search field only exists above the threshold; below it the full
      // list comes back even if a query is still remembered.
      const searching = entries.length > SEARCH_THRESHOLD
      const filtered = React.useMemo(() => {
        const needle = searching ? query.trim().toLowerCase() : ''
        if (needle === '') return entries
        return entries.filter(entry => entry.t.toLowerCase().includes(needle))
      }, [entries, query, searching])
      const activeIndex = filtered.length === 0 ? -1 : Math.min(active, filtered.length - 1)

      const panelKeyDown = event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setOpen(false)
          return
        }
        if (filtered.length === 0) return
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setActive(Math.min(filtered.length - 1, activeIndex + 1))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setActive(Math.max(0, activeIndex - 1))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const entry = filtered[activeIndex]
          if (entry !== undefined) apply(entry)
        }
      }

      const list = filtered.map((entry, index) =>
        h(
          'li',
          { key: `${entry.at ?? 0}:${index}:${entry.t.slice(0, 16)}` },
          h(
            'button',
            {
              type: 'button',
              className: 'dsh-ih-row',
              'data-active': index === activeIndex ? 'true' : 'false',
              title: entry.t,
              onMouseEnter: () => setActive(index),
              onClick: () => apply(entry),
            },
            h('span', { className: 'dsh-ih-text' }, entry.t),
            h('span', { className: 'dsh-ih-meta' }, formatAge(entry.at, tr)),
            h(
              'span',
              {
                className: 'dsh-ih-del',
                role: 'button',
                tabIndex: -1,
                'aria-label': tr('panel.delete'),
                title: tr('panel.delete'),
                onClick: event => {
                  event.stopPropagation()
                  removeEntry(entries.indexOf(entry))
                },
              },
              '×',
            ),
          ),
        ),
      )

      const popover = open
        ? h(
            'div',
            {
              ref: panelRef,
              className: 'dsh-ih-panel',
              role: 'dialog',
              'aria-label': tr('panel.title'),
              style: {
                left: anchor === null ? 12 : Math.max(8, anchor.left),
                bottom: anchor === null ? 96 : anchor.bottom,
                width: 340,
              },
              onKeyDown: panelKeyDown,
            },
            h(
              'div',
              { className: 'dsh-ih-head' },
              h('span', { className: 'dsh-ih-title' }, tr('panel.title')),
              h('button', { type: 'button', className: 'dsh-ih-close', onClick: () => setOpen(false), 'aria-label': tr('panel.close') }, '×'),
            ),
            searching
              ? h('input', {
                  className: 'dsh-ih-search',
                  value: query,
                  placeholder: tr('panel.search'),
                  'aria-label': tr('panel.search'),
                  onChange: event => {
                    setQuery(event.target.value)
                    setActive(0)
                  },
                  // The panel binds the same key map; stop the bubble so one
                  // press is handled once.
                  onKeyDown: event => {
                    panelKeyDown(event)
                    event.stopPropagation()
                  },
                })
              : null,
            seeding && entries.length === 0
              ? h('div', { className: 'dsh-ih-empty' }, tr('panel.loading'))
              : entries.length === 0
                ? h('div', { className: 'dsh-ih-empty' }, tr('panel.empty'))
                : filtered.length === 0
                  ? h('div', { className: 'dsh-ih-empty' }, tr('panel.emptyFiltered'))
                  : h('ul', { className: 'dsh-ih-list', role: 'listbox', 'aria-label': tr('panel.title') }, list),
            notice === null ? null : h('div', { className: 'dsh-ih-hint' }, notice),
            entries.length === 0 && !seeding ? null : h('div', { className: 'dsh-ih-hint' }, tr('panel.hint')),
            h(
              'div',
              { className: 'dsh-ih-foot' },
              h(
                'span',
                { className: 'dsh-ih-pref', title: tr('pref.hint') },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-ih-switch',
                    role: 'switch',
                    'aria-checked': enabled ? 'true' : 'false',
                    'aria-label': tr('pref.label'),
                    onClick: togglePreference,
                  },
                ),
                h('span', null, tr('pref.label')),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-ih-clear',
                  disabled: entries.length === 0,
                  onClick: () => {
                    clearedRef.current = true
                    setEntries([])
                    setQuery('')
                  },
                },
                tr('panel.clear'),
              ),
            ),
          )
        : null

      // The entry is session-scoped, so this is defensive only: without a
      // Session there is nothing to remember and no composer to fill.
      if (typeof sessionId !== 'string' || sessionId === '') return null

      return h(
        'div',
        { className: 'dsh-ih-root', ref: rootRef },
        h(
          'button',
          {
            ref: buttonRef,
            type: 'button',
            className: 'dsh-ih-btn',
            'data-off': enabled ? 'false' : 'true',
            'aria-expanded': open ? 'true' : 'false',
            'aria-haspopup': 'dialog',
            'aria-label': tr('action.label'),
            title: tr('action.title'),
            onClick: () => {
              if (open) setOpen(false)
              else openPanel()
            },
          },
          h(ClockIcon),
        ),
        popover,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-input-history: dictionaries')
        ctx.effect(() => installStyles(), 'dsh-input-history: styles')

        /**
         * Seed one Session's list from its event window, newest first. No
         * paging: the already-loaded window is enough to make a running
         * Session useful on first open.
         *
         * Only a real user turn counts. The log also carries user-ROLE
         * messages the Harness injects for the model — workspace instructions
         * (AGENTS.md), goal rounds, plan notices, skill catalogs, recalled
         * session references, plan-mode steers — and those are not things the
         * user typed, so they must never become recallable input. See
         * {@link isRealUserTurn} for the discriminator.
         */
        const seed = async sessionId => {
          const sessions = ctx.get('sessions')
          if (sessions === undefined || typeof sessions.retain !== 'function') return []
          const reference = sessions.retain(sessionId, { source: 'gateway' })
          try {
            const binding = await reference.ready
            const view = binding.eventSource.getSnapshot()
            const entries = view === undefined || !Array.isArray(view.entries) ? [] : view.entries
            const rows = []
            for (const entry of entries) {
              if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
              if (!isRealUserTurn(entry.event)) continue
              rows.push({ t: cleanText(textOf(entry.event.data)), at: typeof entry.event.time === 'number' ? entry.event.time : null })
            }
            rows.reverse()
            return rows.slice(0, MAX_ENTRIES)
          } finally {
            reference.release()
          }
        }

        /**
         * Live recording feed: hand every event the Session journal appends
         * after this call to `onAppend`, filtered to real user turns.
         *
         * @param sessionId - Session whose journal to follow.
         * @param onAppend - receives rows `{ t, at }` oldest-first.
         * @returns disposer that releases the Session reference.
         */
        const watch = (sessionId, onAppend) => {
          const sessions = ctx.get('sessions')
          if (sessions === undefined || typeof sessions.retain !== 'function') return () => {}
          const reference = sessions.retain(sessionId, { source: 'gateway' })
          let disposed = false
          let stop = null
          const collect = window => {
            if (window === null || typeof window !== 'object') return
            const change = window.change
            if (change === null || typeof change !== 'object' || change.kind !== 'append') return
            if (!Array.isArray(change.entries)) return
            const rows = []
            for (const entry of change.entries) {
              if (entry === null || typeof entry !== 'object' || entry.type !== 'event') continue
              if (!isRealUserTurn(entry.event)) continue
              rows.push({ t: cleanText(textOf(entry.event.data)), at: typeof entry.event.time === 'number' ? entry.event.time : null })
            }
            if (rows.length > 0) onAppend(rows)
          }
          reference.ready
            .then(binding => {
              if (disposed) return
              stop = binding.eventSource.subscribe(() => {
                if (disposed) return
                collect(binding.eventSource.getSnapshot())
              })
              // Events can land between subscription and first paint; take one
              // baseline pass over the current window. The caller de-duplicates
              // by text, so replaying rows already recorded is harmless.
              collect({ change: { kind: 'append', entries: binding.eventSource.getSnapshot().entries } })
            })
            .catch(() => {})
          return () => {
            disposed = true
            if (stop !== null) stop()
            try {
              reference.release()
            } catch {
              /* already released */
            }
          }
        }

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'input-history',
              order: 30,
              locale: NS,
              inject: () => ({ seed, watch }),
            },
            InputHistory,
          ),
        )
      },
    }
  },
})
