/**
 * Turns the kit's `sidebar_state` cookie into `SidebarProvider`'s `defaultOpen`
 * (P19-T01). The kit writes `true`/`false` on every toggle; anything else — no
 * cookie yet, or a value we do not recognise — keeps the sidebar expanded, so
 * a first visit and a corrupted cookie both land on the fuller layout. Reading
 * it on the server is what stops the expanded→collapsed flash on reload.
 */
export function resolveSidebarDefaultOpen(cookieValue: string | undefined): boolean {
  return cookieValue !== 'false';
}
