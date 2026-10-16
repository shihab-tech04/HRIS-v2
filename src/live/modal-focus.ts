type ModalFocusOptions = {
  initialFocus?: HTMLElement | null;
  returnFocus?: HTMLElement | null | (() => HTMLElement | null | undefined);
  fallbackFocus?: HTMLElement | null;
  onEscape?: () => void;
};

const focusableSelector = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element =>
    element.getAttribute('aria-hidden') !== 'true'
    && element.getClientRects().length > 0,
  );
}

/** Keep keyboard focus inside a custom modal and restore it to its opener on close. */
export function activateModalFocusTrap(
  dialog: HTMLElement | null,
  { initialFocus, returnFocus, fallbackFocus, onEscape }: ModalFocusOptions = {},
): () => void {
  if (!dialog) return () => {};

  const activeFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const resolveReturnFocus = () => typeof returnFocus === 'function'
    ? returnFocus() ?? activeFocus
    : returnFocus ?? activeFocus;
  const firstFocusable = getFocusableElements(dialog)[0];
  (initialFocus && dialog.contains(initialFocus) && !initialFocus.matches(':disabled')
    ? initialFocus
    : firstFocusable)?.focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (!dialog.contains(current)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && current === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && current === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    const requestedFocus = resolveReturnFocus();
    const target = requestedFocus?.isConnected ? requestedFocus : fallbackFocus;
    if (target?.isConnected) target.focus();
  };
}
