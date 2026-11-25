window.__ModuleLoader__.load({
  id: '@local/dsh-blank-draft-handoff',
  factory(require) {
    const PREFIX = 'dsh.conversation.'
    const LOG = '[blank-draft-handoff]'

    /** Semantic text of a stored draft; both the structured and the legacy string field are accepted. */
    function textOf(value) {
      const draft = value?.draft
      const text = typeof draft === 'string' ? draft : draft?.text
      return typeof text === 'string' ? text : ''
    }

    /** Parse one stored record; a bare string is treated as the legacy draft-only form. */
    function readRecord(raw) {
      if (raw === null || raw === undefined) return null
      let parsed
      try {
        parsed = JSON.parse(raw)
      } catch {
        return null
      }
      if (typeof parsed === 'string') return { draft: parsed }
      return typeof parsed === 'object' && parsed !== null ? parsed : null
    }

    /**
     * Copy the newest unsent draft of an abandoned blank Session onto `targetId`.
     *
     * The Host mints a fresh Session id for every "New Session" press, so text typed before the
     * first message keeps living under the abandoned id and becomes unreachable. This runs right
     * after the Session is created and before navigation mounts its composer, which then seeds
     * from the record like any other saved draft.
     *
     * The source record is deliberately left in place: an abandoned blank Session is still
     * routable, so deleting its slot would turn a recoverable draft into permanent data loss.
     */
    function carry(host, workspaceId, targetId, status) {
      if (typeof localStorage === 'undefined') return
      if (typeof targetId !== 'string' || targetId === '') {
        if (status) status.reason = 'incompatible: connectBlank did not return a session id'
        return
      }

      const sessionList = host?.sessions?.list
      const workspaceList = host?.workspaces?.list
      if (typeof sessionList?.getSnapshot !== 'function' || typeof workspaceList?.getSnapshot !== 'function') {
        if (status) status.reason = 'incompatible: session list is not reachable from uiWorkspace'
        console.warn(LOG, 'skipped: session list is not reachable from uiWorkspace; update this plugin for the current DSH version')
        return
      }

      let sessions
      let workspaces
      try {
        sessions = sessionList.getSnapshot()
        workspaces = workspaceList.getSnapshot()
      } catch (error) {
        console.warn(LOG, 'skipped: cannot read session snapshots', error)
        return
      }

      const workspace = (workspaces?.items ?? []).find((item) => item.workspaceId === workspaceId)
      // An unresolved Workspace must not widen the search: borrowing another project's draft
      // would surface text the user never typed there.
      if (workspace === undefined) return

      // A target that already holds text wins: never overwrite what the user is typing.
      if (textOf(readRecord(localStorage.getItem(PREFIX + targetId))).trim() !== '') return

      const archived = workspaces?.archivedSessionIds ?? []
      // Insertion order approximates "when this Session first wrote its draft record", which is a
      // close stand-in for how recently it was abandoned; the last match is the newest one.
      const order = Object.keys(localStorage)
      const candidates = (sessions?.ids ?? [])
        .filter((id) => {
          if (id === targetId || archived.includes(id)) return false
          const summary = sessions.byId?.[id]
          if (summary === undefined || summary.blank !== true) return false
          return summary.cwd === workspace.path
        })
        .map((id) => ({ id, at: order.indexOf(PREFIX + id) }))
        .filter((entry) => entry.at >= 0)
        .sort((left, right) => left.at - right.at)

      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const sourceId = candidates[index].id
        const record = readRecord(localStorage.getItem(PREFIX + sourceId))
        if (record === null || textOf(record).trim() === '') continue
        try {
          localStorage.setItem(PREFIX + targetId, JSON.stringify(record))
          if (status) status.lastCarry = { from: sourceId, to: targetId, at: Date.now() }
        } catch (error) {
          console.warn(LOG, 'skipped: draft storage refused the copy', error)
        }
        return
      }
    }

    return {
      inject: ['uiWorkspace'],
      apply(ctx) {
        // 自检入口：DevTools 里看 window.__blankDraftHandoff 就知道这个版本还适不适配
        const status = { version: '1.0.1', active: false, reason: 'starting', hook: 'uiWorkspace.connectBlank', lastCarry: null }
        try {
          globalThis.__blankDraftHandoff = status
        } catch {}

        const service = ctx.uiWorkspace
        if (service === undefined || typeof service.connectBlank !== 'function') {
          status.reason = 'incompatible: uiWorkspace.connectBlank is missing'
          console.warn(LOG, 'inactive: uiWorkspace.connectBlank is missing in this DSH version, so drafts cannot be handed off')
          return
        }
        if (service.__blankDraftHandoffActive === true) {
          status.reason = 'already hooked'
          return
        }

        const original = service.connectBlank
        function handOff(host, workspaceId, sessionId) {
          try {
            carry(host, workspaceId, sessionId, status)
          } catch (error) {
            console.warn(LOG, 'carry failed', error)
          }
        }

        // Keep the original return shape: an internal caller may consume a synchronous result.
        const hooked = function (workspaceId, reuse) {
          const host = this
          const result = original.call(host, workspaceId, reuse)
          if (result !== null && typeof result === 'object' && typeof result.then === 'function') {
            return result.then((sessionId) => {
              // Only the preset-less "New Session" path lost its draft; an explicit prompt keeps reuse.
              if (reuse == null) handOff(host, workspaceId, sessionId)
              return sessionId
            })
          }
          if (reuse == null) handOff(host, workspaceId, result)
          return result
        }

        // Cordis widens its service through a traceable proxy, and assignment forwards to the
        // instance, so this own property shadows the prototype method for internal callers too.
        service.connectBlank = hooked
        service.__blankDraftHandoffActive = true
        status.active = true
        status.reason = 'hooked'

        ctx.effect(() => () => {
          status.active = false
          status.reason = 'disposed'
          try {
            // Never delete: connectBlank may be an own property of the instance, where a deletion
            // would remove the Host's own method rather than just this hook.
            service.connectBlank = original
            service.__blankDraftHandoffActive = false
          } catch (error) {
            console.warn(LOG, 'restore failed', error)
          }
        }, 'blank-draft-handoff: connectBlank hook')
      },
    }
  },
})
