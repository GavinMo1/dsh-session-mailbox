/**
 * Browser half of the branch switcher.
 *
 * Forks already exist as first-class Sessions: `session.fork` stamps the child's
 * header with `parentSession`, and the Client list projection carries it as
 * `parentId` on every row. That makes a fork family a tree the Client already
 * holds — nothing here asks the Host for lineage.
 *
 * The surface is one additive slot entry:
 *   - `conversation.session.header.actions` renders the trigger and, when open,
 *     its own menu (portaled out of the header so the header's overflow and
 *     stacking cannot clip it).
 *
 * The trigger only exists when the current Session has at least one relative:
 * a session with no fork above or below it gets no control at all. The menu is
 * the whole family from the top-most ancestor down, so a branch can reach both
 * its siblings and its own continuation.
 */
window.__ModuleLoader__.load({
  id: 'dsh-branch-switcher',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /**
     * `react-dom` portal, so the menu escapes the header's box. Without it the
     * menu still works, anchored inside the trigger's own wrapper instead.
     */
    let createPortal = null
    try {
      const ReactDOM = require('react-dom')
      if (ReactDOM !== null && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal
    } catch (cause) {
      console.warn('[dsh-branch-switcher] react-dom is unavailable; the branch menu stays inside the header', cause)
    }

    /** Locale namespace owned by this plugin. */
    const NS = 'branchSwitcher'

    /** Copy dictionary (Simplified Chinese). */
    const zh = {
      'action.label': '切换分支',
      'action.aria': '切换分支，这个会话所在的分支共 {n} 个',
      'panel.title': '分支',
      'panel.count': '{n} 个会话',
      'panel.hint': '点击切换 · Esc 关闭',
      'panel.menuAria': '这个会话所在的分支',
      'row.current': '当前',
      'row.running': '运行中',
      'row.archived': '已归档',
      'row.archivedHint': '已归档，不能在这里跳转',
      'time.justNow': '刚刚',
      'time.minutesAgo': '{n} 分钟前',
      'time.hoursAgo': '{n} 小时前',
      'time.daysAgo': '{n} 天前',
      'failed': '切换失败：{message}',
    }

    /** Copy dictionary (English). */
    const en = {
      'action.label': 'Switch branch',
      'action.aria': 'Switch branch; {n} sessions in this branch family',
      'panel.title': 'Branches',
      'panel.count': '{n} sessions',
      'panel.hint': 'Click to switch · Esc to close',
      'panel.menuAria': 'Branches of this session family',
      'row.current': 'Current',
      'row.running': 'Running',
      'row.archived': 'Archived',
      'row.archivedHint': 'Archived — cannot be opened from here',
      'time.justNow': 'just now',
      'time.minutesAgo': '{n} min ago',
      'time.hoursAgo': '{n} h ago',
      'time.daysAgo': '{n} d ago',
      'failed': 'Could not switch: {message}',
    }

    /** Plugin-owned stylesheet, inserted once and removed with the plugin effect. */
    const CSS = `
.dsh-bs-root{position:relative;display:inline-flex;align-items:center}
.dsh-bs-trigger{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-height:28px;padding:3px 6px;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:12px;line-height:18px;font-variant-numeric:tabular-nums}
.dsh-bs-trigger:hover,.dsh-bs-trigger:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-fill-l1,rgba(127,127,127,.12))}
.dsh-bs-trigger[aria-expanded="true"]{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-fill-l1,rgba(127,127,127,.12))}
.dsh-bs-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-bs-trigger svg{display:block;flex:none}
.dsh-bs-triggerCount{font-size:11px;line-height:16px;opacity:.9}

.dsh-bs-panel{position:fixed;z-index:1300;box-sizing:border-box;display:flex;flex-direction:column;max-height:min(62vh,420px);overflow:hidden;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-2));color:var(--dsw-alias-label-primary);box-shadow:0 14px 38px rgba(0,0,0,.26);animation:dsh-bs-in 110ms ease-out}
@keyframes dsh-bs-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.dsh-bs-panelHead{display:flex;align-items:baseline;gap:8px;padding:10px 12px 8px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dsh-bs-panelTitle{font-size:12px;line-height:17px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-bs-panelCount{margin-left:auto;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsh-bs-panelBody{flex:1;min-height:0;overflow:auto;padding:4px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsh-bs-panelFoot{padding:6px 12px 8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;line-height:15px;color:var(--dsw-alias-label-tertiary)}

.dsh-bs-row{position:relative;display:flex;align-items:stretch;gap:2px;box-sizing:border-box;width:100%;margin:0;padding:5px 8px 5px 4px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer;font:inherit;text-align:left}
.dsh-bs-row:hover,.dsh-bs-row:focus-visible{background:var(--dsw-alias-fill-l1,rgba(127,127,127,.12))}
.dsh-bs-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-bs-row[data-current="true"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}
.dsh-bs-row[data-current="true"]:hover{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent)}
.dsh-bs-row[data-current="true"]::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary)}
.dsh-bs-row[data-path="true"] .dsh-bs-rowTitle{color:var(--dsw-alias-label-secondary)}
.dsh-bs-row[data-archived="true"]{cursor:default;opacity:.55}
.dsh-bs-row[data-archived="true"]:hover{background:transparent}
.dsh-bs-row[data-archived="true"][data-current="true"]{opacity:.8}

.dsh-bs-cell{position:relative;flex:none;width:14px}
.dsh-bs-cell[data-rail="line"]::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;transform:translateX(-.5px);background:var(--dsw-alias-border-l2)}
.dsh-bs-elbow::before{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;transform:translateX(-.5px);background:var(--dsw-alias-border-l2)}
.dsh-bs-elbow[data-last="true"]::before{bottom:50%}
.dsh-bs-elbow::after{content:'';position:absolute;left:50%;top:50%;width:7px;height:1px;background:var(--dsw-alias-border-l2)}
.dsh-bs-rootCell::before{content:'';position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}
.dsh-bs-row[data-current="true"] .dsh-bs-rootCell::before{background:var(--dsw-alias-brand-primary)}

.dsh-bs-rowText{display:flex;flex-direction:column;justify-content:center;min-width:0;flex:1;padding-left:4px}
.dsh-bs-rowTitle{overflow:hidden;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;text-overflow:ellipsis}
.dsh-bs-row[data-current="true"] .dsh-bs-rowTitle{font-weight:600}
.dsh-bs-rowMeta{display:inline-flex;align-items:center;gap:6px;flex:none;padding-left:8px;font-size:10px;line-height:16px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
.dsh-bs-ago{font-variant-numeric:tabular-nums}
.dsh-bs-tag{padding:0 5px;border-radius:var(--dsw-radius-xs,4px);font-size:10px;line-height:15px}
.dsh-bs-tagCurrent{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}
.dsh-bs-tagRunning{color:var(--dsw-alias-state-success-primary)}
.dsh-bs-tagArchived{color:var(--dsw-alias-label-tertiary);border:1px solid var(--dsw-alias-border-l2)}
.dsh-bs-tagRunning::before{content:'';display:inline-block;width:5px;height:5px;margin-right:4px;border-radius:50%;background:currentColor;vertical-align:1px;animation:dsh-bs-pulse 1.4s ease-in-out infinite}
@keyframes dsh-bs-pulse{0%,100%{opacity:1}50%{opacity:.35}}
.dsh-bs-error{margin:0;padding:2px 8px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-error-primary)}
`

    /** Insert the plugin stylesheet and return its disposer. */
    function installStyles() {
      const tag = document.createElement('style')
      tag.setAttribute('data-plugin', 'dsh-branch-switcher')
      tag.setAttribute('data-plugin-css', 'dsh-branch-switcher/branches.css')
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

    /** Two-digit zero padding for date parts. */
    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    /**
     * Whether one Session-list row belongs to a fork family.
     *
     * Subagent sessions also carry `parentId`, but they are children of the
     * agent that spawned them, not branches of the conversation; listing them
     * next to forks would offer a jump into a read-only subagent chat.
     * @param row - one `sessions.list` row, or nothing.
     * @returns true only for rows that may sit in a branch tree.
     */
    function isBranchRow(row) {
      return row !== undefined && row !== null && row.origin !== 'subagent'
    }

    /**
     * Collect the fork family of one Session from the list projection.
     *
     * The tree is rooted at the top-most ancestor still present in the list, so
     * a branch also sees its siblings, and a parent also sees every branch cut
     * from it. The list keeps archived Sessions in `byId` (the sidebar filters
     * them out), so an archived ancestor is still walked through and an archived
     * branch is still listed — flagged, because it must not be opened from here.
     * @param view - the `sessions.list` snapshot (`{ ids, byId }`).
     * @param currentId - Session the header belongs to.
     * @param archivedIds - the workspace snapshot's `archivedSessionIds`.
     * @returns `{ rows, others }` with one row per session in render order, or
     *   `null` when the current Session is missing or not a branch candidate.
     */
    function familyOf(view, currentId, archivedIds) {
      if (view === undefined || view === null || typeof currentId !== 'string') return null
      const byId = view.byId
      if (byId === undefined || byId === null || typeof byId !== 'object') return null
      const current = byId[currentId]
      if (!isBranchRow(current)) return null
      const ids = Array.isArray(view.ids) ? view.ids : Object.keys(byId)
      const archived = new Set(Array.isArray(archivedIds) ? archivedIds : [])

      // Walk up while the parent is present and joinsable; a cycle stops the walk.
      let rootId = currentId
      const climbed = new Set([currentId])
      for (let step = 0; step < 64; step += 1) {
        const row = byId[rootId]
        const parentId = row === undefined || row === null ? undefined : row.parentId
        if (typeof parentId !== 'string' || climbed.has(parentId) || !isBranchRow(byId[parentId])) break
        climbed.add(parentId)
        rootId = parentId
      }

      // Children in list order; the list order is the lineage order the sidebar uses.
      const children = new Map()
      for (const id of ids) {
        const row = byId[id]
        if (!isBranchRow(row) || typeof row.parentId !== 'string') continue
        const bucket = children.get(row.parentId)
        if (bucket === undefined) children.set(row.parentId, [id])
        else bucket.push(id)
      }

      const rows = []
      const seen = new Set()
      const walk = (id, depth, guides, last) => {
        if (seen.has(id)) return
        const row = byId[id]
        if (!isBranchRow(row)) return
        seen.add(id)
        const title = typeof row.displayTitle === 'string' && row.displayTitle !== ''
          ? row.displayTitle
          : typeof row.title === 'string' && row.title !== ''
            ? row.title
            : id
        rows.push({
          id,
          title,
          depth,
          guides,
          last,
          running: row.running === true,
          updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
          current: id === currentId,
          archived: archived.has(id),
          ancestor: climbed.has(id) && id !== currentId,
        })
        const kids = (children.get(id) ?? []).filter(kid => !seen.has(kid))
        kids.forEach((kid, index) => walk(kid, depth + 1, guides.concat(last), index === kids.length - 1))
      }
      walk(rootId, 0, [], true)
      // Every relative counts, archived ones included: the map should show the
      // whole family even when the only relative is a ghost (an "rewrite this
      // session" original), it just cannot be entered.
      return { rows, others: rows.filter(row => !row.current).length }
    }

    /**
     * Compact relative time for one row.
     * @param now - current epoch milliseconds.
     * @param time - the row's `updatedAt`.
     * @param t - translator for the locale namespace.
     * @returns a short label, or '' when the row carries no usable time.
     */
    function relativeTime(now, time, t) {
      if (typeof time !== 'number' || !Number.isFinite(time) || time <= 0) return ''
      const delta = Math.max(0, now - time)
      const minute = 60000
      const hour = 3600000
      const day = 86400000
      if (delta < minute) return t('time.justNow')
      if (delta < hour) return t('time.minutesAgo', { n: Math.floor(delta / minute) })
      if (delta < day) return t('time.hoursAgo', { n: Math.floor(delta / hour) })
      if (delta < 7 * day) return t('time.daysAgo', { n: Math.floor(delta / day) })
      const date = new Date(time)
      return `${String(date.getFullYear())}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    }

    /** Branch glyph: two commits on one line and one commit merged from the side. */
    function BranchIcon() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 14,
          height: 14,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          'aria-hidden': 'true',
        },
        h('circle', { cx: 4.2, cy: 3.5, r: 1.75 }),
        h('circle', { cx: 4.2, cy: 12.5, r: 1.75 }),
        h('circle', { cx: 11.8, cy: 6.1, r: 1.75 }),
        h('path', { d: 'M4.2 5.25v5.5' }),
        h('path', { d: 'M11.8 7.85c0 2.2-1.5 3.3-3.3 3.6-1.5.25-2.5.6-3 1.05' }),
      )
    }

    /** Panel measurement style: laid out but invisible until the anchor is known. */
    const MEASURE_STYLE = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: 320,
      visibility: 'hidden',
    }

    /**
     * Header control: a trigger that opens the family tree of the current Session.
     *
     * Renders nothing at all when the Session has no relative, so ordinary
     * sessions keep the stock header.
     * @param props - slot props: `sessionId`, `useSessionList`, `openSession`, `t`.
     */
    function BranchSwitcher(props) {
      const list = props.useSessionList(state => state)
      const workspaceList = props.useWorkspaceList(state => state)
      const sessionId = props.sessionId
      const archivedIds = workspaceList === undefined || workspaceList === null ? undefined : workspaceList.archivedSessionIds
      const family = React.useMemo(() => familyOf(list, sessionId, archivedIds), [list, sessionId, archivedIds])
      const [open, setOpen] = React.useState(false)
      const [pos, setPos] = React.useState(null)
      const [now, setNow] = React.useState(() => Date.now())
      const [failure, setFailure] = React.useState(null)
      const rootRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const panelRef = React.useRef(null)
      const currentRef = React.useRef(null)

      const rows = family === null ? [] : family.rows
      const others = family === null ? 0 : family.others
      const visible = family !== null && others > 0

      // A family can shrink under an open menu (a fork archived elsewhere).
      React.useEffect(() => {
        if (!open || visible) return
        setOpen(false)
      }, [open, visible])

      // Keep relative labels honest while the menu stays open.
      React.useEffect(() => {
        if (!open) return undefined
        setNow(Date.now())
        const timer = window.setInterval(() => {
          setNow(Date.now())
        }, 30000)
        return () => {
          window.clearInterval(timer)
        }
      }, [open])

      // Place the portaled menu under the trigger, flipping above when it would
      // leave the viewport; re-place on resize and on any scroll ancestor.
      React.useLayoutEffect(() => {
        if (!open || createPortal === null) return undefined
        const place = () => {
          const anchor = triggerRef.current
          const panel = panelRef.current
          if (anchor === null || panel === null) return
          const rect = anchor.getBoundingClientRect()
          const margin = 12
          const gap = 6
          const width = Math.min(340, Math.max(240, window.innerWidth - margin * 2))
          const height = panel.offsetHeight
          const aligned = rect.right - width
          const left = Math.min(Math.max(margin, aligned), Math.max(margin, window.innerWidth - width - margin))
          let top = rect.bottom + gap
          if (top + height > window.innerHeight - margin) {
            const above = rect.top - gap - height
            top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin)
          }
          setPos({ top, left, width })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
          window.removeEventListener('resize', place)
          window.removeEventListener('scroll', place, true)
        }
      }, [open, rows.length])

      // Dismiss on any pointer that is neither the trigger nor the menu, and on
      // Escape from anywhere (capture, so a nested handler cannot swallow it).
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = event => {
          const target = event.target
          if (rootRef.current !== null && rootRef.current.contains(target)) return
          if (panelRef.current !== null && panelRef.current.contains(target)) return
          setOpen(false)
        }
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
        }
      }, [open])

      // Land focus on the current branch, scrolled into view inside the menu.
      React.useEffect(() => {
        if (!open) return
        const node = currentRef.current
        if (node === null || node === undefined) return
        node.focus({ preventScroll: true })
        node.scrollIntoView({ block: 'nearest' })
      }, [open])

      if (!visible) return null

      const switchTo = id => {
        setFailure(null)
        try {
          props.openSession(id)
        } catch (cause) {
          // Keep the menu open so the failure is readable where it happened.
          console.error('[dsh-branch-switcher] could not open the session', cause)
          setFailure(props.t('failed', { message: messageOf(cause) }))
          return
        }
        setOpen(false)
      }

      const rowNode = row => {
        const cells = []
        for (let level = 0; level < row.depth; level += 1) {
          cells.push(
            h('span', {
              key: `rail-${String(level)}`,
              className: 'dsh-bs-cell',
              'data-rail': row.guides[level] === true ? 'none' : 'line',
            }),
          )
        }
        if (row.depth === 0) {
          cells.push(h('span', { key: 'root', className: 'dsh-bs-cell dsh-bs-rootCell' }))
        } else {
          cells.push(h('span', { key: 'elbow', className: 'dsh-bs-cell dsh-bs-elbow', 'data-last': row.last ? 'true' : 'false' }))
        }
        const meta = []
        if (row.current) meta.push(h('span', { key: 'current', className: 'dsh-bs-tag dsh-bs-tagCurrent' }, props.t('row.current')))
        if (row.running && !row.archived) meta.push(h('span', { key: 'running', className: 'dsh-bs-tag dsh-bs-tagRunning' }, props.t('row.running')))
        if (row.archived) meta.push(h('span', { key: 'archived', className: 'dsh-bs-tag dsh-bs-tagArchived' }, props.t('row.archived')))
        const ago = relativeTime(now, row.updatedAt, props.t)
        if (ago !== '') meta.push(h('span', { key: 'ago', className: 'dsh-bs-ago' }, ago))
        const body = [
          cells,
          h('span', { key: 'text', className: 'dsh-bs-rowText' }, h('span', { className: 'dsh-bs-rowTitle' }, row.title)),
          meta.length === 0 ? null : h('span', { key: 'meta', className: 'dsh-bs-rowMeta' }, meta),
        ]
        const shared = {
          className: 'dsh-bs-row',
          'data-current': row.current ? 'true' : 'false',
          'data-path': row.ancestor ? 'true' : 'false',
          'data-archived': row.archived ? 'true' : 'false',
          'aria-current': row.current ? 'true' : undefined,
          title: row.archived ? `${row.title} · ${props.t('row.archivedHint')}` : row.title,
        }
        // Archived Sessions cannot be switched to from here (their log is
        // read-only until restored), so they render as an inert row: no button,
        // no hover affordance, no keyboard stop.
        if (row.archived && !row.current) {
          return h('div', { key: row.id, role: 'menuitem', 'aria-disabled': 'true', ...shared }, body)
        }
        return h(
          'button',
          {
            key: row.id,
            type: 'button',
            role: 'menuitem',
            ...shared,
            ref: row.current ? currentRef : undefined,
            onClick: () => {
              if (row.current) {
                setOpen(false)
                return
              }
              switchTo(row.id)
            },
          },
          body,
        )
      }

      const panel = h(
        'div',
        {
          ref: panelRef,
          className: 'dsh-bs-panel',
          role: 'menu',
          'aria-label': props.t('panel.menuAria'),
          style: createPortal === null
            ? { position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 'min(340px, calc(100vw - 24px))' }
            : pos === null
              ? MEASURE_STYLE
              : { position: 'fixed', top: pos.top, left: pos.left, width: pos.width },
        },
        h(
          'div',
          { className: 'dsh-bs-panelHead' },
          h('span', { className: 'dsh-bs-panelTitle' }, props.t('panel.title')),
          h('span', { className: 'dsh-bs-panelCount' }, props.t('panel.count', { n: rows.length })),
        ),
        h('div', { className: 'dsh-bs-panelBody' }, rows.map(rowNode)),
        failure === null ? null : h('p', { className: 'dsh-bs-error' }, failure),
        h('div', { className: 'dsh-bs-panelFoot' }, props.t('panel.hint')),
      )

      return h(
        'span',
        { className: 'dsh-bs-root', ref: rootRef },
        h(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: 'dsh-bs-trigger',
            title: props.t('action.label'),
            'aria-label': props.t('action.aria', { n: rows.length }),
            'aria-haspopup': 'menu',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => {
              setFailure(null)
              setPos(null)
              setOpen(!open)
            },
          },
          h(BranchIcon, null),
          h('span', { className: 'dsh-bs-triggerCount' }, String(others)),
        ),
        open ? (createPortal === null ? panel : createPortal(panel, document.body)) : null,
      )
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-branch-switcher: dictionaries')
        ctx.effect(() => installStyles(), 'dsh-branch-switcher: styles')
        const list = ctx.sessions.list
        const workspaceList = ctx.workspaces.list
        const openSession = id => {
          ctx.uiWorkspace.openSession(id)
        }
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'branch-switcher',
              // Left of the per-session action buttons: it is navigation, not editing.
              order: 15,
              locale: NS,
              inject: () => ({ hooks: { sessionList: list, workspaceList }, openSession }),
            },
            BranchSwitcher,
          ),
        )
      },
      /** Pure helpers, exported only so the shipped file can be tested headlessly. */
      __test: { familyOf, relativeTime, isBranchRow },
    }
  },
})
