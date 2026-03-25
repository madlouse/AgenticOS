import { refreshEntrySurfaces } from '../utils/entry-surface-refresh.js';

export async function runEntrySurfaceRefresh(args: any): Promise<string> {
  const result = await refreshEntrySurfaces(args ?? {});
  return JSON.stringify(result, null, 2);
}
