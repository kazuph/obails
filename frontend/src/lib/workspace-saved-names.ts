import type { WorkspaceStateSnapshot } from "./workspace-snapshot";

export function savedWorkspaceNames(snapshot: WorkspaceStateSnapshot): string[] {
  return (snapshot.savedWorkspaces ?? []).map(({ name }) => name);
}
