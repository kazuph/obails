export function mediaUrl(path: string, token: string): string | null {
  if (!token) return null;
  const query = new URLSearchParams({ path, token });
  return `/media/audio?${query}`;
}
