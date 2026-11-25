// The one delivery step for send_session_message: queue unattributed, then put
// the message on disk before returning.
//
// Two things happen here and both are load-bearing:
//
//   1. `agents.withoutInitiator` runs the inbox splice as an unattributed Host
//      operation, the way a Web UI prompt is admitted: the target stays a
//      runtime root instead of being recorded as work initiated by the sender's
//      turn. This is the same call the shipped relay implementation
//      (dsh-session-messaging) makes around its own delivery.
//   2. `sessions.flush` is what shortens the window between "accepted into the
//      in-memory inbox" and "written to the durable transcript". Without it a
//      restart before the target's next write loses the message.
//
// Neither failure mode is allowed to fail the call: a missing `sessions`
// service or a rejecting flush leaves the message accepted, so reporting "not
// delivered" here would be a lie in the other direction.
//
// `sessions` is read through ctx.get because the plugin's `inject` list
// deliberately omits it (a missing required service stops the whole plugin from
// applying, taking list_sessions down with it).
export async function deliverUnattributed(ctx, target, send) {
  ctx.agents.withoutInitiator(send)

  let sessions
  try {
    sessions = ctx.get('sessions') ?? ctx.sessions
  } catch {
    sessions = undefined
  }
  if (sessions === undefined || sessions === null || typeof sessions.flush !== 'function') return

  try {
    await sessions.flush(target.session)
  } catch {
    /* acceptance is the inbox splice above; the flush only shortens the window */
  }
}
