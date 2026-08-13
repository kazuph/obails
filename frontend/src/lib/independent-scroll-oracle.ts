export type ScrollOwnerSnap = {
  left: string;
  body: string;
  right: string;
  outlineY: number;
};

export type IndependentScrollVerdict = {
  rightOnly: boolean;
  leftOnly: boolean;
  bodyOnly: boolean;
  independentScrollAssert: boolean;
};

/**
 * Pure oracle for independent left/body/right scroll owners (order: right → left → body).
 * Body scroll may auto-sync Outline (highlight / scroll-into-view), so bodyOnly must not
 * require stable right hash or outlineY — only left owner isolation + body change.
 */
export function evaluateIndependentScroll(
  baseline: ScrollOwnerSnap,
  afterRight: ScrollOwnerSnap,
  afterLeft: ScrollOwnerSnap,
  afterBody: ScrollOwnerSnap,
  eps = 1.5,
): IndependentScrollVerdict {
  const rightOnly = Math.abs(afterRight.outlineY - baseline.outlineY) > eps
    && afterRight.left === baseline.left
    && afterRight.body === baseline.body;
  const leftOnly = afterLeft.left !== afterRight.left
    && afterLeft.body === afterRight.body
    && Math.abs(afterLeft.outlineY - afterRight.outlineY) <= eps;
  const bodyOnly = afterBody.body !== afterLeft.body
    && afterBody.left === afterLeft.left;
  return {
    rightOnly,
    leftOnly,
    bodyOnly,
    independentScrollAssert: rightOnly && leftOnly && bodyOnly,
  };
}
