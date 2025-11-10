import { useEffect } from 'react';

// Simple modal accessibility helpers: ESC to close, restore focus, and basic Tab focus trapping
export function useModalAccessibility(open, onClose, ref) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const prevActive = document.activeElement;
    const node = ref && ref.current ? ref.current : null;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    // Focus first focusable element inside modal or the modal itself
    try {
      if (node) {
        const focusables = Array.from(node.querySelectorAll(focusableSelector)).filter(el => !el.disabled && el.offsetParent !== null);
        if (focusables.length) focusables[0].focus();
        else {
          node.tabIndex = -1;
          node.focus();
        }
      }
    } catch (e) {
      // ignore
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose && onClose();
        return;
      }
      if (e.key === 'Tab') {
        if (!node) return;
        const focusables = Array.from(node.querySelectorAll(focusableSelector)).filter(el => !el.disabled && el.offsetParent !== null);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    }

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      try { if (prevActive && prevActive.focus) prevActive.focus(); } catch (e) {}
    };
  }, [open, onClose, ref]);
}
