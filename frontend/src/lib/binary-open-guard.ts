export type BinaryOpenIdentity = {
  paneId: string;
  generation: number;
};

/** The local identity that must still match before an awaited binary load may paint. */
export function isCurrentBinaryOpen(
  expected: BinaryOpenIdentity,
  current: BinaryOpenIdentity,
): boolean {
  return expected.paneId === current.paneId && expected.generation === current.generation;
}
