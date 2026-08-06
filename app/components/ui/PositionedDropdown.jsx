import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MAX_HEIGHT = 220;
const GAP = 4;

export default function PositionedDropdown({ anchorRef, open, children }) {
  const [rect, setRect] = useState(null);

  useEffect(() => {
    if (!open) return;

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

  if (!open || !rect) return null;

  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  const openAbove = spaceBelow < MAX_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.min(MAX_HEIGHT, openAbove ? spaceAbove : spaceBelow);

  return createPortal(
    <div style={{
      position: "fixed",
      ...(openAbove
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
      left: rect.left,
      width: rect.width,
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
