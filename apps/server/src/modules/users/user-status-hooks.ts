/**
 * Called when a user's account status changes.
 * Add domain-specific side effects here (e.g. suspending resources, revoking access).
 */
export async function onUserStatusChange(
  _userId: string,
  _newStatus: "active" | "inactive" | "locked" | "deleted",
  _previousStatus: string,
  _reason?: string | null
): Promise<void> {
  // Add domain-specific status change logic here
}
