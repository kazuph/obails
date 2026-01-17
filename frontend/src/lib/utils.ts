/**
 * Creates a debounced version of a function that delays its execution
 * until after the specified delay has elapsed since the last call.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T {
  let timeoutId: number;
  return ((...args: unknown[]) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  }) as T;
}
