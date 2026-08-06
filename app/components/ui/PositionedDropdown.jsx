import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const MAX_HEIGHT = 220;
const GAP = 4;

export default function PositionedDropdown({ anchorRef, open, children, minWidth }) {
  const [rect, setRect] = useState(null);

  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      if (anchorRef.current) setRect(anchorRef.current.getBoundingClientRect());
    };

    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, anchorRef]);

  // Solange kein plausibler Rect vorliegt (Anchor noch nicht gelayoutet), lieber nichts
  // rendern als ein Dropdown bei (0,0) aufblitzen zu lassen.
  if (!open || !rect || (rect.width === 0 && rect.height === 0)) return null;

  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openAbove = spaceBelow < MAX_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.min(MAX_HEIGHT, openAbove ? spaceAbove : spaceBelow);
  const width = minWidth ? Math.max(rect.width, minWidth) : rect.width;
  const left = Math.min(rect.left, window.innerWidth - width - GAP);

  return createPortal(
    <div style={{
      position: "fixed",
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      left,
      width,
      background: "var(--p-color-bg-surface)",
      border: "1px solid var(--p-color-border)",
      borderRadius: 6,
      zIndex: 9999,
      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
      maxHeight: Math.max(maxHeight, 80),
      overflowY: "auto",
    }}>
      {children}
    </div>,
    document.body
  );
}
