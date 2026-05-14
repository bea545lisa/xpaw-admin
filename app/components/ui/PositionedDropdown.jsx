import { createPortal } from "react-dom";

export default function PositionedDropdown({ anchorRef, open, children }) {
  if (!open) return null;
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;
  return createPortal(
    <div style={{
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      background: "var(--p-color-bg-surface)",
      border: "1px solid var(--p-color-border)",
      borderRadius: 6,
      zIndex: 9999,
      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
      maxHeight: 220,
      overflowY: "auto",
    }}>
      {children}
    </div>,
    document.body
  );
}
