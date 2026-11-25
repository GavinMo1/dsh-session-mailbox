/**
 * Host half of the history-message editor bundle.
 *
 * The capability is entirely Client-side: the browser half reads the retained
 * Session's event window, forks at the boundary before the selected message,
 * and prompts the rewritten text in the child. The Host row therefore exists
 * only to mount the bundle and its Client artifact.
 */
export function apply() {}
