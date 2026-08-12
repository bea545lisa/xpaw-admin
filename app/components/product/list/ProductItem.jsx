import { Box, Button, Checkbox, Text, TextField, Icon } from '@shopify/polaris';
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useProductContext } from "../../../context/ProductContext.jsx";
import { useNavigate, useLocation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";
import LocaleFlag from "../../shared/LocaleFlag.jsx";

import {
  ViewIcon,
  DuplicateIcon,
  DeleteIcon,
  CategoriesIcon,
  HashtagIcon,
  VariantIcon,
  CartSaleIcon,
  AlertTriangleIcon, XIcon,
} from "@shopify/polaris-icons";

const pillMuted = (isDark) => ({
  fontSize: "10px",
  background: isDark ? "#2a2d35" : "#f4f4f5",
  color: isDark ? "#b0b7c3" : "#52525b",
  borderRadius: 999,
  padding: "3px 8px",
  fontWeight: 500,
});

function formatTemplateSuffix(raw) {
  if (!raw || !String(raw).trim()) return null;
  return String(raw)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionHeading({ icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ display: "flex", width: 16, height: 16 }}>
        <Icon source={icon} tone="subdued" />
      </span>
      <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--p-color-text-secondary)" }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status, onClick }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const labelMap = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
  const pillStyles = {
    ACTIVE:   isDark ? { background: "#1a3a2a", color: "#6ee7a8" } : { background: "#dcfce7", color: "#166534" },
    DRAFT:    isDark ? { background: "#1e2d3d", color: "#7eb8e8" } : { background: "#dbeafe", color: "#1e40af" },
    ARCHIVED: isDark ? { background: "#332b1a", color: "#e8c97d" } : { background: "#fef9c3", color: "#854d0e" },
  };
  const style = pillStyles[status] ?? pillStyles.DRAFT;
  return (
    <button
      onClick={onClick}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
      title="Status ändern"
    >
      <span style={{
        display: "inline-block",
        fontSize: "12px",
        fontWeight: 500,
        padding: "3px 10px",
        borderRadius: 999,
        ...style,
      }}>
        {labelMap[status] ?? status}
      </span>
    </button>
  );
}

// ── Produktbild mit Anzahl-Badge ─────────────────────────────────────────────
function ImageStrip({ product, onClick }) {
  const imgs = product.node.images?.edges?.map(e => e.node) ?? [];
  const main = imgs[0];
  const extra = imgs.length - 1;
  const shopify = useAppBridge();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

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
        <div style={{ width: 40, height: 40, background: isDark ? "#333" : "#f0f0f0", borderRadius: 4 }} />
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
  product, selected, onSelect, isPendingDelete, isRestored, index, shop, translatedLocales = [] }) {

  const { onDelete, onStatusToggle, onTitleSave, onDuplicate, openMenuId, setOpenMenuId } = useProductContext();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(product.node.title);
  const [hoveredAction, setHoveredAction] = useState(null);
  const isMenuOpen = openMenuId === product.node.id;
  const [isHovered, setIsHovered] = useState(false);

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

  const collectionNodes = product.node.collections?.edges?.map(({ node: c }) => c) ?? [];
  const sortedTags = [...(product.node.tags ?? [])].sort();
  const variants = product.node.variants?.edges ?? [];
  const optionGroups = (product.node.options ?? [])
    .filter((option) => option?.name && option.name !== "Title")
    .map((option) => ({
      name: option.name,
      values: (option.optionValues?.map((value) => value?.name).filter(Boolean) ?? option.values ?? [])
        .filter((value) => value && value !== "Default Title"),
    }))
    .filter((option) => option.values.length > 0);
  const hasRealVariants = optionGroups.length > 0;
  const variantCount = hasRealVariants
    ? optionGroups.reduce((count, option) => count * Math.max(option.values.length, 1), 1)
    : 0;
  const hasSale = variants.some(
    (e) => e.node.compareAtPrice && parseFloat(e.node.compareAtPrice) > parseFloat(e.node.price)
  );
  const templateBadge = formatTemplateSuffix(product.node.templateSuffix);
  // Interne/technische Felder (SEO, App-eigene Verwaltungsdaten, JSON-Rohdaten) nie in der
  // Listenvorschau anzeigen — die sind für Endnutzer nicht lesbar (z.B. rohes JSON).
  const HIDDEN_LIST_PREVIEW_KEYS = ["title_tag", "description_tag", "metafields_order", "option_abbreviations", "option_swatches"];
  const metaFields = product.node.metafields?.edges
    ?.filter((e) => !HIDDEN_LIST_PREVIEW_KEYS.includes(e.node.key) && e.node.type !== "json" && e.node.type !== "list.metaobject_reference")
    ?.slice(0, 3)
    .map((e) => e.node) ?? [];
  const showMetaRow = metaFields.length > 0;
  const zeroStockValues =
    variants
      ?.filter((e) => (e.node.inventoryQuantity ?? 0) === 0)
      ?.flatMap((e) => e.node.selectedOptions?.map((so) => so.value) ?? []) ?? [];
  const variantLabels = hasRealVariants
    ? optionGroups.map((option) => `${option.name}: ${option.values.join(", ")}`)
    : ["—"];
  const variantCountLabel = hasRealVariants
    ? `${variantCount} ${variantCount === 1 ? "Variante" : "Varianten"}`
    : null;

  const COL_PILL_CAP = 2;

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

      {/* Äußerster div — Hover-Handler + Click */}
      <div className={`product-row ${isDark ? (index % 2 === 0 ? "product-row-even" : "product-row-odd") : ""}`}
           style={{
             position: "relative", overflow: "visible", cursor: "pointer",
             borderBottom: "1px solid var(--p-color-border)",
             transition: "background 0.1s",
           }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => {
          const id = product.node.id.split("/").pop();
          navigate(`/app/products/${id}${location.search}`, { state: { from: `${location.pathname}${location.search}` } });
        }}
      >
        <div style={{ position: "relative", zIndex: 1 }}>  {/* ← Inhalt-Wrapper */}
          <div style={{
            padding: "4px 0 4px 0",
            //borderTop: "1px solid var(--p-color-border-subdued)",
          }}>
            <div className="product-grid" style={{ gap: 0 }}>
            {

              /* Spalte 1: Produkt (Karte mit Unterbereichen) */}
              <div style={{ minWidth: 0, display: "flex", alignItems: "stretch" }}>
                <div
                  className="product-card"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderRadius: 10,
                    paddingTop: 8, paddingLeft: 4,
                    border: "1px solid var(--p-color-border-subdued)",
                    background: isDark ? "transparent" : "var(--p-color-bg-surface)",
                    overflow: "hidden",
                  }}
                >
                  {/* Kopfzeile: Auswahl, Bild, Titel, Badge, Attribute */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "8px 8px 8px 4px",
                    }}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox label="" labelHidden checked={selected} onChange={onSelect} />
                    </div>
                    <ImageStrip
                      product={product}
                      onClick={() => {
                        const id = product.node.id.split("/").pop();
                         navigate(`/app/products/${id}${location.search}`, {
                           state: { from: `${location.pathname}${location.search}` },
                         });
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 3 }}>
                      {editingTitle ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center", width: "100%" }} onClick={(e) => e.stopPropagation()}>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Text variant="bodyMd" fontWeight="semibold">
                            <span
                              style={{
                                cursor: "pointer",
                                color: isDark ? "#f3f4f6" : "#111827",
                              }}
                              onClick={(e) => { e.stopPropagation(); handleTitleClick(); }}
                              title="Klicken zum Bearbeiten"
                            >
                              {product.node.title}
                            </span>
                          </Text>
                          {translatedLocales.map((loc) => (
                            <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                              <LocaleFlag locale={loc.locale} round size={12} />
                            </span>
                          ))}
                        </div>
                      )}
                      {(templateBadge || showMetaRow) && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            flexWrap: "nowrap",
                            alignItems: "center",
                            gap: 12,
                            minWidth: 0,
                            maxWidth: "100%",
                            overflowX: "auto",
                            scrollbarWidth: "thin",
                          }}
                        >
                          {templateBadge && (
                            <span style={{ flexShrink: 0 }}>
                              <Badge tone="info">{templateBadge}</Badge>
                            </span>
                          )}
                          {showMetaRow && (
                            <span style={{ flexShrink: 0, fontSize: "10px", color: isDark ? "#b0b7c3" : "#9ca3af", whiteSpace: "nowrap" }}>
                              {metaFields.map((f, i) => (
                                <span key={f.id}>
                                  {i > 0 && "  ·  "}
                                  <strong style={{ color: isDark ? "#b0b7c3" : "#6b7280" }}>{f.key}</strong>: {f.displayValue ?? f.value}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                      borderTop: "1px solid var(--p-color-border-subdued)",
                      paddingLeft: 18,
                    }}
                  >
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRight: "1px solid var(--p-color-border-subdued)",
                        minWidth: 0,
                      }}
                    >
                      <SectionHeading icon={CategoriesIcon} label="Kollektionen" />
                      {collectionNodes.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {collectionNodes.slice(0, COL_PILL_CAP).map((c) => (
                            <span key={c.id} style={pillMuted(isDark)}>{c.title}</span>
                          ))}
                          {collectionNodes.length > COL_PILL_CAP && (
                            <span style={pillMuted(isDark)}>+{collectionNodes.length - COL_PILL_CAP}</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "11px", color: isDark ? "#b0b7c3" : "#9ca3af" }}>—</span>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRight: "1px solid var(--p-color-border-subdued)",
                        minWidth: 0,
                      }}
                    >
                      <SectionHeading icon={HashtagIcon} label="Tags" />
                      {sortedTags.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {sortedTags.slice(0, COL_PILL_CAP).map((tag) => (
                            <span key={tag} style={pillMuted(isDark)}>{tag}</span>
                          ))}
                          {sortedTags.length > COL_PILL_CAP && (
                            <span style={pillMuted(isDark)}>+{sortedTags.length - COL_PILL_CAP}</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: "11px", color: isDark ? "#b0b7c3" : "#9ca3af" }}>—</span>
                      )}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRight: "1px solid var(--p-color-border-subdued)",
                        minWidth: 0,
                      }}
                    >
                      <SectionHeading icon={VariantIcon} label="Varianten" />
                      <div style={{ display: "flex", flexDirection: "column", fontSize: "11px", lineHeight: 1.45, color: "var(--p-color-text-secondary)" }}>
                        {optionGroups.map(({ name, values }) => (
                          <span key={name} style={{ display: "inline-flex", marginRight: 8, marginBottom: 4 }}>
                            <strong style={{ marginRight: 4 }}>{name}:</strong>
                            {values.map((v, vi) => (
                              <span key={`${name}-${v}-${vi}`} style={{ color: zeroStockValues.includes(v) ? "#f97316" : "var(--p-color-text-secondary)" }}>
                              {vi > 0 && ", "}{v}
                              </span>
                            ))}
                          </span>
                        ))}
                        {variantCountLabel && (
                          <div style={{ color: isDark ? "#b0b7c3" : "#9ca3af", marginTop: 2 }}>{variantCountLabel}</div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: "8px 12px", minWidth: 0 }}>
                      <SectionHeading icon={CartSaleIcon} label="Sale" />
                      <div style={{ marginTop: 4 }}>
                        {hasSale ? (
                          <span
                            style={{
                              fontSize: "10px",
                              background: isDark ? "#3a1a1a" : "#fee2e2",
                              color: isDark ? "#f87171" : "#dc2626",
                              borderRadius: 999,
                              padding: "3px 8px",
                              fontWeight: 600,
                              letterSpacing: "0.3px",
                              display: "inline-block",
                            }}
                          >
                            SALE
                          </span>
                        ) : (
                          <span style={{ fontSize: "11px", color: isDark ? "#b0b7c3" : "#9ca3af" }}>—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Spalte 2: Preis */}
              <div
                className="product-card"
                style={{
                  textAlign: "right",
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-start",  // ← Inhalt oben
                  paddingTop: 16,
                  paddingRight: 8,
                }}
            >
                {(() => {
                  const prices = product.node.variants?.edges?.map((e) => parseFloat(e.node.price)) ?? [];
                  const comparePrices = product.node.variants?.edges
                    ?.map((e) => parseFloat(e.node.compareAtPrice))
                    .filter((p) => !isNaN(p) && p > 0) ?? [];
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  const hasCompare = comparePrices.length > 0;
                  const priceLabel = prices.length <= 1
                    ? `€${prices[0]?.toFixed(2) ?? "0.00"}`
                    : minPrice === maxPrice ? `€${minPrice.toFixed(2)}` : `ab €${minPrice.toFixed(2)}`;

                  return (
                    <>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          color: hasCompare ? "tomato" : (isDark ? "#c4c9d4" : "#6b7280"),
                        }}
                      >
                        {priceLabel}
                      </span>
                      {hasCompare && (
                        <div style={{ fontSize: "11px", color: isDark ? "#b0b7c3" : "#9ca3af", textDecoration: "line-through" }}>
                          €{Math.min(...comparePrices).toFixed(2)}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Spalte 3: Inventar */}
              <div
                className="product-card"
                style={{
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",   // ← rechtsbündig
                  justifyContent: "flex-start",
                  paddingTop: 16,
                  paddingRight: 8,
                }}
              >
                {(() => {
                  const v = product.node.variants?.edges ?? [];
                  const total = v.reduce((sum, e) => sum + (e.node.inventoryQuantity ?? 0), 0);
                  const hasZero = v.some((e) => (e.node.inventoryQuantity ?? 0) === 0);
                  return (
                    <>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                        <span style={{
                          color: hasZero ? "#f97316" : "var(--p-color-text-secondary)",
                          fontSize: "13px",
                          fontWeight: 600,
                          minWidth: 24,
                          textAlign: "right",
                        }}>
                          {total}
                        </span>
                                              {hasZero ? (
                                                <span style={{ display: "flex", alignItems: "center", width: 16, height: 16, flexShrink: 0 }}>
                            <Icon source={AlertTriangleIcon} tone="warning" />
                          </span>
                        ) : (
                          <span style={{ width: 16, flexShrink: 0 }} />
                          )}
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Spalte 4: Status */}
              <div
                className="product-card"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-start",
                  alignSelf: "stretch",
                  paddingTop: "16px"
                }}
              >
                <StatusBadge status={product.node.status} onClick={() => onStatusToggle(product.node.id, product.node.status)} />
              </div>

              {/* Spalte 5: Radiales Aktionsmenü */}
              <div
                className="product-card"
                style={{
                  position: "relative",
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "flex-start",
                  alignSelf: "stretch",
                  paddingTop: 2, paddingRight: 0,
                  zIndex: isMenuOpen ? 100 : 1,
                  overflow: "visible",
                }}
                onMouseLeave={() => { setOpenMenuId(null); setHoveredAction(null); }}
               >

                {/* Unsichtbare Hover-Fläche die Lücken abdeckt */}
                {isMenuOpen && (
                  <div style={{
                    position: "absolute",
                    top: -20, left: -80,
                    width: 160, height: 160,
                    zIndex: 0,
                    pointerEvents: "all",
                  }} />
                )}

                {/* Trigger Button */}
                <button
                  onMouseEnter={() => setOpenMenuId(product.node.id)}
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}
                  style={{
                    background: isMenuOpen ? "var(--p-color-bg-surface)" : "transparent",
                    border: "none", borderRadius: "50%",
                    width: 44, height: 44,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: isMenuOpen ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                    transition: "background 0.2s, box-shadow 0.2s",
                    zIndex: 2,
                    position: "absolute",
                    top: 4,
                    left: "50%",
                    transform: "translateX(-50%)",
                  }}
                >
                  {isMenuOpen
                    ? <div style={{ transform: "scale(1.25)" }}><Icon source={XIcon} tone="subdued" /></div>
                    : <span style={{ fontSize: 18, color: "var(--p-color-text-secondary)", fontWeight: "bold", lineHeight: 1 }}>⋮</span>
                  }
                </button>

                {/* Radiale Buttons */}
                {!isPendingDelete && (() => {
                  const actions = [
                    { icon: ViewIcon, label: "Vorschau", bg: "var(--p-color-bg-surface)", onClick: () => {
                        window.open(product.node.onlineStorePreviewUrl, "_blank");
                      }},
                    { icon: DuplicateIcon, label: "Duplizieren", bg: "var(--p-color-bg-surface)", onClick: () => onDuplicate(product) },
                    { icon: DeleteIcon, label: "Löschen", bg: "var(--p-color-bg-surface)", onClick: () => onDelete(product) },
                  ];

                  const totalAngle = 95;
                  const startAngle = 175;
                  const radiusX = 60;
                  const radiusY = 70;

                  return actions.map((action, i) => {

                    const angle = startAngle + (totalAngle / (actions.length - 1)) * i;
                    const rad = (angle * Math.PI) / 180;
                    const yOffset = i === 1 ? -8 : 0;
                    const x = Math.cos(rad) * radiusX;
                    const y = -Math.sin(rad) * radiusY + yOffset;

                    return (
                      <div
                        key={i}
                        onClick={(e) => { e.stopPropagation(); action.onClick(); setOpenMenuId(null); }}
                        onMouseEnter={() => { setHoveredAction(i); setOpenMenuId(product.node.id); }}
                        onMouseLeave={() => setHoveredAction(null)}
                        title={action.label}
                        style={{
                          position: "absolute",
                          left: "50%", top: "20%",
                          opacity: isMenuOpen ? 1 : 0,
                          cursor: "pointer", zIndex: 10,
                          width: 44, height: 44,
                          borderRadius: "50%",
                          background: action.bg,
                          boxShadow: hoveredAction === i
                            ? "0 4px 16px rgba(0,0,0,0.35)"
                            : "0 2px 8px rgba(0,0,0,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transform: isMenuOpen
                            ? `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${hoveredAction === i ? 1.15 : 1})`
                            : `translate(-50%, -50%) scale(0)`,
                          transition: `transform 0.25s ease ${i * 40}ms, opacity 0.2s ease ${i * 40}ms, box-shadow 0.15s ease`,
                        }}
                      >
                        <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon source={action.icon} tone={action.label === "Löschen" ? "critical" : "subdued"} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
