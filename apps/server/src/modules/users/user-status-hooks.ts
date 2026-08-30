export async function onUserStatusChange(
  _userId: string,
  _newStatus: "active" | "inactive" | "locked" | "deleted",
  _previousStatus: string,
  _reason?: string | null
): Promise<void> {}
