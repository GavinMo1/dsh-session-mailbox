/**
 * Host half of the branch switcher bundle.
 *
 * The capability is entirely Client-side: the browser half reads the Session
 * list projection the Client already holds (`parentSessionId` lineage) and
 * navigates with the existing `uiWorkspace.openSession` seam. The Host row
 * therefore exists only to mount the bundle and its Client artifact.
 */
export function apply() {}
