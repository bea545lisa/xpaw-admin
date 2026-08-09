import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BlockStack, Button, ChoiceList } from "@shopify/polaris";
import { useColorScheme } from "../context/ColorSchemeContext.js";
import { DeleteIcon, SearchIcon } from "@shopify/polaris-icons";

// ── Pill ─────────────────────────────────────────────────────────────────────

function FilterPill({ title, value, onClick, onRemove }) {
  return (
    <button type="button" className="toolbar-pill" onClick={onClick}>
      <span className="toolbar-pill-title">{title}</span>
      <span className="toolbar-pill-operator">ist</span>
      <span className="toolbar-pill-value">{value}</span>
      <span
        role="button"
        tabIndex={0}
        className="toolbar-pill-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onRemove(); } }}
        aria-label={`${title} entfernen`}
      >×</span>
    </button>
  );
}

// ── Optionen ──────────────────────────────────────────────────────────────────

const FINANCIAL_CHOICES = [
  { label: "Bezahlt",       value: "paid" },
  { label: "Ausstehend",    value: "pending" },
  { label: "Erstattet",     value: "refunded" },
  { label: "Storniert",     value: "voided" },
];

const FULFILLMENT_CHOICES = [
  { label: "Offen",         value: "unfulfilled" },
  { label: "Versendet",     value: "shipped" },
  { label: "Teilweise",     value: "partial" },
];

const FINANCIAL_LABELS = Object.fromEntries(FINANCIAL_CHOICES.map((c) => [c.value, c.label]));
const FULFILLMENT_LABELS = Object.fromEntries(FULFILLMENT_CHOICES.map((c) => [c.value, c.label]));

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function OrderToolbar({
  search, setSearch,
  financialStatus, setFinancialStatus,
  fulfillmentStatus, setFulfillmentStatus,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [overlayOpen, setOverlayOpen]       = useState(false);
  const [activeEditor, setActiveEditor]     = useState("financial");
  const [overlayPosition, setOverlayPosition] = useState({ left: 8, top: 46 });
  const [isFilterBarActive, setIsFilterBarActive] = useState(false);

  const shellRef   = useRef(null);
  const filterRef  = useRef(null);
  const overlayRef = useRef(null);

  const closeOverlay = () => { setOverlayOpen(false); setIsFilterBarActive(false); };

  const openOverlay = (editor, anchor) => {
    if (editor) setActiveEditor(editor);
    const anchorRect = anchor?.getBoundingClientRect();
    if (anchorRect) {
      setOverlayPosition({
        left: Math.max(8, anchorRect.left),
        top: anchorRect.bottom + 8,
      });
    }
    setOverlayOpen(true);
    setIsFilterBarActive(true);
  };

  // Overlay schließen bei Klick außerhalb
  useEffect(() => {
    const handlePointerDown = (e) => {
      if (!overlayOpen) return;
      if (shellRef.current?.contains(e.target) || overlayRef.current?.contains(e.target)) return;
      closeOverlay();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [overlayOpen]);

  const appliedFilters = [
    ...(financialStatus ? [{
      key: "financial",
      type: "financial",
      title: "Zahlung",
      value: FINANCIAL_LABELS[financialStatus] ?? financialStatus,
      onRemove: () => setFinancialStatus(""),
    }] : []),
    ...(fulfillmentStatus ? [{
      key: "fulfillment",
      type: "fulfillment",
      title: "Versand",
      value: FULFILLMENT_LABELS[fulfillmentStatus] ?? fulfillmentStatus,
      onRemove: () => setFulfillmentStatus(""),
    }] : []),
  ];

  const hasAnyFilter = Boolean(search?.trim()) || Boolean(financialStatus) || Boolean(fulfillmentStatus);

  const resetAll = () => {
    setSearch("");
    setFinancialStatus("");
    setFulfillmentStatus("");
  };

  return (
    <BlockStack gap="0">
      <div ref={shellRef} className="otb-shell">
        <div className="otb-row">
          {/* Unified Search + Pills */}
          <div
            ref={filterRef}
            className={`otb-search ${isFilterBarActive || overlayOpen ? "active" : ""}`}
            onClick={(e) => { setIsFilterBarActive(true); if (!overlayOpen) openOverlay(activeEditor, e.currentTarget); }}
            onFocusCapture={() => setIsFilterBarActive(true)}
          >
            <span className="otb-search-icon">
              <Button variant="plain" icon={SearchIcon} accessibilityLabel="Suchen" disabled />
            </span>
            <div className="otb-inline-content">
              {appliedFilters.map((f) => (
                <FilterPill
                  key={f.key}
                  title={f.title}
                  value={f.value}
                  onClick={(e) => { e.stopPropagation(); openOverlay(f.type, e.currentTarget); }}
                  onRemove={f.onRemove}
                />
              ))}
              {hasAnyFilter && (
                <Button
                  className="otb-action-icon visible"
                  icon={DeleteIcon}
                  accessibilityLabel="Alle Filter löschen"
                  variant="plain"
                  onClick={(e) => { e.stopPropagation(); resetAll(); }}
                />
              )}
              <input
                className="otb-input"
                aria-label="Bestellungen suchen"
                placeholder={appliedFilters.length ? "" : "Bestellnummer oder E-Mail…"}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => { setIsFilterBarActive(true); if (!overlayOpen) openOverlay("financial", filterRef.current); }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        {/* Overlay via Portal — bricht aus jedem overflow/stacking-context aus */}
        {overlayOpen && typeof document !== "undefined" && createPortal(
          <div
            ref={overlayRef}
            className="otb-overlay"
            style={{ left: overlayPosition.left, top: overlayPosition.top }}
          >
            <div className="otb-tabs">
              <button type="button" className={`otb-tab ${activeEditor === "financial" ? "active" : ""}`} onClick={() => setActiveEditor("financial")}>Zahlung</button>
              <button type="button" className={`otb-tab ${activeEditor === "fulfillment" ? "active" : ""}`} onClick={() => setActiveEditor("fulfillment")}>Versand</button>
            </div>
            <div className="otb-editor">
              {activeEditor === "financial" ? (
                <ChoiceList
                  title="Zahlungsstatus"
                  titleHidden
                  choices={FINANCIAL_CHOICES}
                  selected={financialStatus ? [financialStatus] : []}
                  onChange={([v]) => setFinancialStatus(v ?? "")}
                />
              ) : (
                <ChoiceList
                  title="Versandstatus"
                  titleHidden
                  choices={FULFILLMENT_CHOICES}
                  selected={fulfillmentStatus ? [fulfillmentStatus] : []}
                  onChange={([v]) => setFulfillmentStatus(v ?? "")}
                />
              )}
              <div className="otb-footer">
                <Button variant="plain" onClick={resetAll}>Alles löschen</Button>
                <Button onClick={closeOverlay}>Fertig</Button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      <style>{`
        .otb-shell { position: relative; border: 1px solid var(--p-color-border-subdued); border-radius: 10px; background: var(--p-color-bg-surface); }
        .otb-row { display: flex; gap: 8px; align-items: center; padding: 8px; }
        .otb-search { flex: 1; display: flex; align-items: center; gap: 4px; border: 1px solid var(--p-color-border); border-radius: 8px; padding: 0 8px; min-height: 40px; cursor: text; }
        .otb-search.active { }
        .otb-search-icon :global(button) { min-width: 24px; padding: 0; }
        .otb-inline-content { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; }
        .otb-input { border: 0; outline: 0; background: transparent; min-width: 160px; flex: 1; font-size: 14px; color: var(--p-color-text); line-height: 20px; }
        .otb-action-icon { display: none !important; width: 30px; height: 30px; min-width: 30px; padding: 0; border-radius: 999px; flex: 0 0 auto; border: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); }
        .otb-action-icon.visible { display: inline-flex !important; }
        .otb-action-icon.visible:hover { background: var(--p-color-bg-fill-tertiary); }
        .otb-action-icon :global(.Polaris-Button__Icon) { margin: 0; }
        .toolbar-pill { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--p-color-border-subdued); background: var(--p-color-bg-surface-secondary); border-radius: 999px; padding: 3px 8px; font-size: 12px; cursor: pointer; white-space: nowrap; }
        .toolbar-pill-title { color: var(--p-color-text-subdued); }
        .toolbar-pill-operator { color: var(--p-color-text-subdued); padding: 0 2px; }
        .toolbar-pill-value { color: var(--p-color-text); font-weight: 600; background: var(--p-color-bg-fill-tertiary); border-radius: 999px; padding: 1px 6px; }
        .toolbar-pill-remove { width: 18px; height: 18px; min-width: 18px; border: 0; border-radius: 999px; background: var(--p-color-bg-surface); color: var(--p-color-text-subdued); display: inline-flex; align-items: center; justify-content: center; padding: 0; line-height: 1; opacity: 0; transition: opacity 120ms ease, background-color 120ms ease; }
        .toolbar-pill-remove:hover { background: var(--p-color-bg-fill-tertiary); }
        .toolbar-pill:hover .toolbar-pill-remove { opacity: 1; }
        .otb-overlay { position: fixed; width: 360px; border: 1px solid var(--p-color-border-subdued); border-radius: 10px; background: var(--p-color-bg-surface); box-shadow: 0 10px 24px rgba(0,0,0,0.12); display: grid; grid-template-columns: 140px 1fr; z-index: 9999; }
        .otb-tabs { border-right: 1px solid var(--p-color-border-subdued); padding: 8px; display: grid; gap: 4px; align-content: start; }
        .otb-tab { text-align: left; border: 0; background: transparent; border-radius: 6px; padding: 8px; cursor: pointer; font-size: 13px; color: var(--p-color-text-subdued); }
        .otb-tab.active { background: var(--p-color-bg-fill-tertiary); color: var(--p-color-text); font-weight: 600; }
        .otb-editor { padding: 10px; display: grid; gap: 10px; min-width: 200px; }
        .otb-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--p-color-border-subdued); padding-top: 8px; }
        @media (max-width: 700px) {
          .otb-overlay { width: calc(100% - 16px); left: 8px !important; grid-template-columns: 1fr; }
          .otb-tabs { border-right: 0; border-bottom: 1px solid var(--p-color-border-subdued); grid-auto-flow: column; }
        }
      `}</style>
    </BlockStack>
  );
}
