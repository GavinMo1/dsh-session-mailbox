/**
 * Host half of the composer input-history bundle.
 *
 * The capability is entirely Client-side: the browser half records the
 * published InputState, keeps a per-Session list in localStorage, and writes
 * recalled text through the provided `inputActions.setDraft`. The Host row
 * exists only to mount the bundle and its Client artifact.
 */
export function apply() {}
