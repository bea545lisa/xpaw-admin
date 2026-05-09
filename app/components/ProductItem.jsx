import { Box, Button, Checkbox, Badge, Text, TextField, Icon } from '@shopify/polaris';
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useProductContext } from "../context/ProductContext";
import { useNavigate, useLocation } from "react-router";
import {
  ViewIcon,
  EditIcon,
  NoteIcon,
  DuplicateIcon,
  DeleteIcon
} from "@shopify/polaris-icons";

function StatusBadge({ status, onClick }) {
  const toneMap = { ACTIVE: "success", DRAFT: "info", ARCHIVED: "warning" };
  const labelMap = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      title="Status ändern"
    >
      <Badge tone={toneMap[status] ?? "info"}>{labelMap[status] ?? status}</Badge>
    </button>
  );
}

// ── Produktbild mit Anzahl-Badge ─────────────────────────────────────────────
function ImageStrip({ product, onClick }) {
  const imgs = product.node.images?.edges?.map(e => e.node) ?? [];
  const main = imgs[0];
  const extra = imgs.length - 1;

  return (
    <div
      onClick={onClick}
      style={{ width: 40, height: 40, flexShrink: 0, position: "relative", cursor: onClick ? "pointer" : "default" }}
      title={onClick ? "Detailseite öffnen" : undefined}
    >
      {main ? (
        <img
          src={main.url}
          alt={main.altText ?? product.node.title}
          loading="lazy"
          width={40}
          height={40}
          style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, display: "block" }}
        />
      ) : (
        <div style={{ width: 40, height: 40, background: "#f0f0f0", borderRadius: 4 }} />
      )}
      {extra > 0 && (
        <div style={{
          position: "absolute", bottom: 2, right: 2,
          background: "rgba(0,0,0,0.52)",
          color: "white", fontSize: 9, fontWeight: 700,
          borderRadius: 3, padding: "1px 3px", lineHeight: 1.4,
          pointerEvents: "none",
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProductItem({
  product, selected, onSelect, isPendingDelete, isRestored, index }) {

  const { onEdit, onDelete, onMetafields, onStatusToggle, onTitleSave, onDuplicate, openMenuId, setOpenMenuId } = useProductContext();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(product.node.title);
  const [hoveredAction, setHoveredAction] = useState(null);
  const isMenuOpen = openMenuId === product.node.id;

  const inputRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();

  const handleTitleClick = () => {
    setTitleValue(product.node.title);
    setEditingTitle(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleTitleSave = () => {
    setEditingTitle(false);
    if (titleValue.trim() && titleValue !== product.node.title) {
      onTitleSave?.(product.node.id, titleValue.trim());
    }
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") {
      setTitleValue(product.node.title);
      setEditingTitle(false);
    }
  };

  useEffect(() => {
    if (editingTitle) {
      setTimeout(() => inputRef.current?.querySelector("input")?.focus(), 50);
    }
  }, [editingTitle]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{
        opacity: isPendingDelete ? 0 : 1,
        x: isPendingDelete ? 40 : isRestored ? -20 : 0,
        scale: isPendingDelete ? 0.95 : 1,
      }}
      exit={{ opacity: 0, x: 40, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
    >
      <div style={{ overflow: "visible" }}>
        <Box paddingInline="200" paddingBlock="100" borderBlockStartWidth="025" borderColor="border-subdued">
          <div className="product-grid">

            {/* Spalte 1: Titel */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              <Checkbox label="" labelHidden checked={selected} onChange={onSelect} />

              {/* ── Produktbild ── */}
              <ImageStrip
                product={product}
                onClick={() => {
                  const id = product.node.id.split("/").pop();
                  navigate(`/app/products/${id}${location.search}`);
                }}
              />

              <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                {editingTitle ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextField
                        label="" labelHidden
                        value={titleValue}
                        onChange={setTitleValue}
                        onKeyDown={handleTitleKeyDown}
                        autoComplete="off"
                      />
                    </div>
                    <Button size="slim" onClick={handleTitleSave}>✓</Button>
                    <Button size="slim" onClick={() => { setTitleValue(product.node.title); setEditingTitle(false); }}>✕</Button>
                  </div>
                ) : (
                  <Text>
                    <span
                      style={{ cursor: "pointer", textDecoration: "underline" }}
                      onClick={handleTitleClick}
                      title="Klicken zum Bearbeiten"
                    >
                      {product.node.title}
                    </span>
                  </Text>
                )}

                <div style={{ marginTop: -4 }}>
                  <span style={{ fontSize: "11px", color: "var(--p-color-text-secondary)" }}>
                    {product.node.metafields?.edges?.map(e => `${e.node.namespace}: ${e.node.value}`).join("  |  ")}
                  </span>
                </div>

                {/* Collections */}
                {product.node.collections?.edges?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    {product.node.collections.edges.map(({ node: c }) => (
                      <span key={c.id} style={{
                        fontSize: "10px",
                        background: "var(--p-color-bg-fill-info-secondary)",
                        color: "var(--p-color-text-info)",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}>
                        {c.title}
                      </span>
                    ))}
                  </div>
                )}

                {/* Tags */}
                {product.node.tags?.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    {[...product.node.tags].sort().map((tag, i) => (
                      <span key={i} style={{
                        fontSize: "10px",
                        background: "var(--p-color-bg-fill-secondary)",
                        color: "var(--p-color-text-secondary)",
                        borderRadius: 4,
                        padding: "1px 6px",
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {product.node.options?.filter(o => o.name !== "Title").length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, marginTop: 5 }}>
                    {product.node.options.filter(o => o.name !== "Title").map((o, i) => {
                      const zeroStockValues = product.node.variants?.edges
                        ?.filter(e => (e.node.inventoryQuantity ?? 0) === 0)
                        ?.flatMap(e => e.node.selectedOptions?.map(so => so.value) ?? []) ?? [];
                      return (
                        <span key={i} style={{ fontSize: "11px" }}>
                          <strong style={{ color: "var(--p-color-text-secondary)" }}>{o.name}</strong>
                          {": "}
                          {o.values.map((v, vi) => (
                            <span key={vi} style={{ color: zeroStockValues.includes(v) ? "#f97316" : "var(--p-color-text-secondary)" }}>
                              {vi > 0 && ", "}{v}
                            </span>
                          ))}
                        </span>
                      );
                    })}
                    {/* SALE Badge */}
                    {product.node.variants?.edges?.some(e =>
                      e.node.compareAtPrice && parseFloat(e.node.compareAtPrice) > parseFloat(e.node.price)
                    ) && (
                      <span style={{
                        fontSize: "9px", background: "#fee2e2", color: "#dc2626",
                        borderRadius: 3, padding: "1px 4px", display: "inline-block",
                        marginTop: 2, width: "fit-content",
                      }}>SALE</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Spalte 2: Preis */}
            <div style={{ textAlign: "right" }}>
              <Text tone="subdued" variant="bodySm">
                {(() => {
                  const prices = product.node.variants?.edges?.map(e => parseFloat(e.node.price)) ?? [];
                  const comparePrices = product.node.variants?.edges?.map(e => parseFloat(e.node.compareAtPrice)).filter(p => !isNaN(p) && p > 0) ?? [];
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  const hasCompare = comparePrices.length > 0;
                  const priceLabel = prices.length <= 1
                    ? `€${prices[0]?.toFixed(2) ?? "0.00"}`
                    : minPrice === maxPrice ? `€${minPrice.toFixed(2)}` : `ab €${minPrice.toFixed(2)}`;

                  return (
                    <div style={{ textAlign: "right" }}>
                      {hasCompare && (
                        <div style={{ fontSize: "10px", color: "#9ca3af", textDecoration: "line-through" }}>
                          €{Math.min(...comparePrices).toFixed(2)}
                        </div>
                      )}
                      <Text tone={hasCompare ? "critical" : "subdued"} variant="bodySm">{priceLabel}</Text>
                      {hasCompare && (
                        <div style={{ fontSize: "9px", background: "#fee2e2", color: "#dc2626", borderRadius: 3, padding: "1px 4px", display: "inline-block" }}>
                          SALE
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Text>
            </div>

            {/* Spalte 3: Lager */}
            <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
              {(() => {
                const variants = product.node.variants?.edges ?? [];
                const total = variants.reduce((sum, e) => sum + (e.node.inventoryQuantity ?? 0), 0);
                const hasZero = variants.some(e => (e.node.inventoryQuantity ?? 0) === 0);
                return (
                  <>
                    <span style={{ display: "inline-block", width: 24, textAlign: "right", color: hasZero ? "#f97316" : "var(--p-color-text-secondary)", fontSize: "12px" }}>
                      {total}
                    </span>
                    <span style={{ display: "inline-block", width: 14, fontSize: "12px" }}>
                      {hasZero ? "⚠" : ""}
                    </span>
                  </>
                );
              })()}
            </div>

            {/* Spalte 4: Radiales Aktionsmenü */}
            <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center",
              zIndex: isMenuOpen ? 100 : 1,
              overflow: "visible" }}>
              <div style={{
                position: "absolute", top: 0, left: 0,
                width: "100%", height: "100%",
                zIndex: 1, pointerEvents: "none",
              }} />
              {/* Trigger Button */}
              <button
                onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => prev === product.node.id ? null : product.node.id); }}
                style={{
                  background: isMenuOpen ? "var(--p-color-bg-fill-brand)" : "transparent",
                  border: "none", borderRadius: "50%",
                  width: 32, height: 32, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.2s", zIndex: 2, position: "relative",
                }}
              >
                <span style={{
                  fontSize: 18,
                  color: isMenuOpen ? "white" : "var(--p-color-text-secondary)",
                  fontWeight: "bold", lineHeight: 1,
                }}>⋮</span>
              </button>

              {/* Radiale Buttons */}
              {!isPendingDelete && (() => {
                const actions = [
                  { icon: ViewIcon, label: "Vorschau", tone: undefined, onClick: () => { const id = product.node.id.split("/").pop(); navigate(`/app/products/${id}${location.search}`); } },
                  { icon: NoteIcon, label: "Metafields", tone: undefined, onClick: () => onMetafields(product.node.id) },
                  { icon: DuplicateIcon, label: "Duplizieren", tone: undefined, onClick: () => onDuplicate(product) },
                  { icon: EditIcon, label: "Bearbeiten", tone: undefined, onClick: () => onEdit(product) },
                  { icon: DeleteIcon, label: "Löschen", tone: "critical", onClick: () => onDelete(product) },
                ];

                const totalAngle = 120;
                const startAngle = 120;
                const radius = 80;

                return actions.map((action, i) => {
                  const angle = startAngle + (totalAngle / (actions.length - 1)) * i;
                  const rad = (angle * Math.PI) / 180;
                  const x = Math.cos(rad) * radius;
                  const y = -Math.sin(rad) * radius;

                  return (
                    <div
                      key={i}
                      onClick={(e) => { e.stopPropagation(); action.onClick(); setOpenMenuId(null); }}
                      onMouseEnter={() => setHoveredAction(i)}
                      onMouseLeave={() => setHoveredAction(null)}
                      style={{
                        position: "absolute",
                        left: "50%", top: "50%",
                        transform: isMenuOpen
                          ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1)`
                          : `translate(-50%, -50%) scale(0)`,
                        opacity: isMenuOpen ? 1 : 0,
                        borderRadius: 20,
                        background: action.tone === "critical" ? "#fee2e2" : "var(--p-color-bg-surface)",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                        display: "flex", alignItems: "center", gap: 4,
                        cursor: "pointer", zIndex: 10,
                        padding: hoveredAction === i ? "6px 12px 6px 8px" : "6px 8px",
                        maxWidth: hoveredAction === i ? 150 : 36,
                        overflow: "hidden", whiteSpace: "nowrap",
                        transition: `transform 0.25s ease ${i * 40}ms, opacity 0.2s ease ${i * 40}ms, max-width 0.2s ease, padding 0.2s ease`,
                      }}
                    >
                      <div style={{
                        width: 24, height: 24, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transform: "scale(1.2)",
                      }}>
                        <Icon
                          source={action.icon}
                          tone={action.tone === "critical" ? "critical" : "base"}
                        />
                      </div>
                      <span style={{
                        fontSize: "12px",
                        color: action.tone === "critical" ? "#dc2626" : "var(--p-color-text)",
                        maxWidth: hoveredAction === i ? 100 : 0,
                        overflow: "hidden",
                        transition: "max-width 0.2s ease",
                        whiteSpace: "nowrap",
                      }}>
                        {action.label}
                      </span>
                    </div>
                  );
                });
              })()}

              {/* Overlay zum Schließen */}
              {isMenuOpen && (
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 9 }}
                  onClick={() => setOpenMenuId(null)}
                />
              )}
            </div>

            {/* Spalte 5: Status */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <StatusBadge status={product.node.status} onClick={() => onStatusToggle(product.node.id, product.node.status)} />
            </div>

          </div>
        </Box>
      </div>
    </motion.div>
  );
}