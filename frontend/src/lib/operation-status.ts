export type OperationStatusKind = "status" | "alert";

export type OperationStatusView = {
  message: string;
  kind: OperationStatusKind;
  retryAvailable: boolean;
  dismissAvailable: boolean;
};

export function classifyOperationMessage(message: string): OperationStatusKind {
  const normalized = message.trim().toLocaleLowerCase();
  if (!normalized) return "status";
  if (
    normalized.startsWith("could not")
    || normalized.startsWith("cannot ")
    || normalized.includes(" failed")
    || normalized.includes("conflict")
    || normalized.includes("unknown command")
    || normalized.includes("not available")
    || normalized.includes("cannot be blank")
    || normalized.includes("enter the exact")
  ) {
    return "alert";
  }
  return "status";
}

export function buildOperationStatusView(
  message: string,
  retry?: (() => Promise<void>) | null,
): OperationStatusView {
  const trimmed = message.trim();
  return {
    message: trimmed,
    kind: classifyOperationMessage(trimmed),
    retryAvailable: Boolean(trimmed && retry),
    dismissAvailable: Boolean(trimmed),
  };
}
