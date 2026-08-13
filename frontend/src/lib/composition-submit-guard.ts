const IME_KEY_CODE = 229;

export type FilenameInputKeyboardActions = {
  submit: () => void;
  cancel: () => void;
};

export type FilenameInputKeyboard = {
  reset: () => void;
  detach: () => void;
  shouldSubmitOnEnter: (event: KeyboardEvent) => boolean;
  shouldCancelOnEscape: (event: KeyboardEvent) => boolean;
};

export function createCompositionSubmitGuard() {
  let composing = false;
  let suppressEnter = false;
  let clearSuppress: number | null = null;

  const cancelScheduledClear = () => {
    if (clearSuppress === null) return;
    cancelAnimationFrame(clearSuppress);
    clearSuppress = null;
  };

  const reset = () => {
    composing = false;
    suppressEnter = false;
    cancelScheduledClear();
  };

  const onCompositionStart = () => {
    cancelScheduledClear();
    composing = true;
    suppressEnter = false;
  };

  const onCompositionEnd = () => {
    composing = false;
    suppressEnter = true;
    cancelScheduledClear();
    clearSuppress = requestAnimationFrame(() => {
      suppressEnter = false;
      clearSuppress = null;
    });
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    suppressEnter = false;
    cancelScheduledClear();
  };

  const isImeProtected = (event: KeyboardEvent): boolean =>
    composing || event.isComposing || event.keyCode === IME_KEY_CODE;

  const shouldSubmitOnEnter = (event: KeyboardEvent): boolean => {
    if (event.key !== "Enter") return false;
    if (isImeProtected(event) || suppressEnter) return false;
    return true;
  };

  const shouldCancelOnEscape = (event: KeyboardEvent): boolean => {
    if (event.key !== "Escape") return false;
    if (isImeProtected(event)) return false;
    return true;
  };

  const attach = (element: EventTarget): (() => void) => {
    element.addEventListener("compositionstart", onCompositionStart);
    element.addEventListener("compositionend", onCompositionEnd);
    element.addEventListener("keyup", onKeyUp as EventListener);
    return () => {
      element.removeEventListener("compositionstart", onCompositionStart);
      element.removeEventListener("compositionend", onCompositionEnd);
      element.removeEventListener("keyup", onKeyUp as EventListener);
      reset();
    };
  };

  return { attach, reset, shouldSubmitOnEnter, shouldCancelOnEscape };
}

export function installFilenameInputKeyboard(
  input: HTMLInputElement,
  actions: FilenameInputKeyboardActions,
): FilenameInputKeyboard {
  const guard = createCompositionSubmitGuard();
  const detachGuard = guard.attach(input);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      if (!guard.shouldSubmitOnEnter(event)) return;
      event.preventDefault();
      actions.submit();
      return;
    }
    if (event.key === "Escape") {
      if (!guard.shouldCancelOnEscape(event)) return;
      event.preventDefault();
      actions.cancel();
    }
  };
  input.addEventListener("keydown", onKeyDown);
  return {
    shouldSubmitOnEnter: (event) => guard.shouldSubmitOnEnter(event),
    shouldCancelOnEscape: (event) => guard.shouldCancelOnEscape(event),
    reset: () => guard.reset(),
    detach: () => {
      input.removeEventListener("keydown", onKeyDown);
      detachGuard();
    },
  };
}
