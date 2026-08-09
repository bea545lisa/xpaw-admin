import { TextField, Text, BlockStack, InlineStack, Divider, Button, InlineError } from "@shopify/polaris";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { computeVariantCombinations } from "../../hooks/useVariantDrafts.js";
import { generateSku } from "../../utils/skuAbbreviation.js";

// ── SKU-Konventions-Check ─────────────────────────────────────────────────────
function checkConvention(sku) {
  if (!sku) return null;
  // Erlaubt: alphanumerisch + Bindestriche, mind. 2 Teile
  if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)+$/.test(sku)) {
    return "SKU folgt nicht der Konvention (Empfehlung: Präfix-Option1-Option2, z.B. 12345-bl-m)";
  }
  return null;
}

// ── SKU-Feld mit Duplikat- und Konventions-Prüfung ───────────────────────────
function SkuField({ value, onChange, productId }) {
  const fetcher   = useFetcher();
  const timerRef  = useRef(null);
  const [warning, setWarning] = useState(null);

  const conventionWarn = checkConvention(value);

  useEffect(() => {
    if (!value?.trim()) { setWarning(null); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const fd = new FormData();
      fd.append("action", "checkSku");
      fd.append("sku", value.trim());
      if (productId) fd.append("excludeId", productId);
      fetcher.submit(fd, { method: "post", action: "/app/products" });
    }, 600);
    return () => clearTimeout(timerRef.current);
  }, [value]);

  useEffect(() => {
    if (fetcher.data?.exists) {
      setWarning(`SKU bereits vergeben bei: „${fetcher.data.productTitle}"`);
    } else {
      setWarning(null);
    }
  }, [fetcher.data]);

  const errorMsg = warning ?? conventionWarn;

  return (
    <BlockStack gap="050">
      <TextField
        label="" labelHidden autoComplete="off"
        value={String(value ?? "")}
        onChange={onChange}
        placeholder="—"
        error={!!warning}
      />
      {errorMsg && (
        <span style={{ fontSize: 11, color: warning ? "#d82c0d" : "#bf8600", lineHeight: 1.3, display: "block" }}>
          {errorMsg}
        </span>
      )}
    </BlockStack>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────
export default function VariantsSection({
  variants, editOptions, setEditOptions, setEditVariants, localImages, productId,
}) {
  const [newValues, setNewValues] = useState({});
  const [previewVariants, setPreviewVariants] = useState([]);
  const [variantImagePicker, setVariantImagePicker] = useState(null);

  // Präfix aus erster vorhandener SKU ableiten, sonst zufällige 5-stellige Nummer
  const inferPrefix = () => {
    const firstSku = variants?.find(v => v.sku)?.sku ?? "";
    if (firstSku.includes("-")) return firstSku.split("-")[0];
    return String(Math.floor(10000 + Math.random() * 90000));
  };
  const [skuPrefix, setSkuPrefix] = useState(inferPrefix);
  const hasRealOptions = editOptions && editOptions.length > 0;
  const defaultVariant = variants?.length === 1 && variants[0]?.title === "Default Title" ? variants[0] : null;

  useEffect(() => {
    if (!hasRealOptions) return;
    const computed = computeVariantCombinations(editOptions, variants);
    // SKU automatisch generieren für Varianten ohne SKU (wenn Präfix gesetzt)
    const withSku = computed.map(v => {
      if (v.sku) return v;
      if (!skuPrefix) return v;
      const optionValues = (v.selectedOptions ?? []).map(o => o.value);
      return { ...v, sku: generateSku(skuPrefix, optionValues) };
    });
    setPreviewVariants(withSku);
    setEditVariants(withSku);
  }, [editOptions, variants, hasRealOptions, setEditVariants]);

  const updateVariant = (variantIndex, changes) => {
    const updated = [...previewVariants];
    updated[variantIndex] = { ...updated[variantIndex], ...changes };
    setPreviewVariants(updated);
    setEditVariants(updated);
  };
  
  return (
    <BlockStack gap="300">

      {/* Preis & Lager — nur Default Variante */}
      {!hasRealOptions && defaultVariant && (
        <>
          <Divider />
          <InlineStack gap="300">
            <div style={{ flex: 1 }}>
              <TextField
                label="Preis (€)" type="number" autoComplete="off"
                value={String(defaultVariant.price)}
                onChange={(val) => setEditVariants([{ ...defaultVariant, price: val }])}
              />
            </div>

            <div style={{ flex: 1 }}>
              <TextField
                label="Vergleichspreis (€)" type="number" autoComplete="off"
                value={String(defaultVariant.compareAtPrice ?? "")}
                onChange={(val) => setEditVariants([{ ...defaultVariant, compareAtPrice: val }])}
                placeholder="—"
              />
            </div>

            <div style={{ flex: 1 }}>
              <TextField
                label="Lagerbestand" type="number" autoComplete="off"
                value={String(defaultVariant.inventoryQuantity ?? 0)}
                onChange={(val) => setEditVariants([{ ...defaultVariant, inventoryQuantity: val }])}
              />
            </div>

            <div style={{ flex: 1 }}>
              <Text variant="bodySm" as="p">SKU</Text>
              <SkuField
                value={defaultVariant.sku ?? ""}
                onChange={(val) => setEditVariants([{ ...defaultVariant, sku: val }])}
                productId={productId}
              />
            </div>

            <div style={{ flex: 1 }}>
              <TextField
                label="Barcode" autoComplete="off"
                value={String(defaultVariant.barcode ?? "")}
                onChange={(val) => setEditVariants([{ ...defaultVariant, barcode: val }])}
                placeholder="—"
              />
            </div>

          </InlineStack>
        </>
      )}

      {/* Optionen */}
      {hasRealOptions && (
        <>
          <Divider />
          <Text variant="headingSm">Optionen</Text>
          <BlockStack gap="200">
            {editOptions.map((option, oi) => (
              <div
                key={option.id ?? oi}
                style={{
                  padding: 12,
                  border: "1px solid var(--p-color-border-subdued)",
                  borderRadius: 8,
                  background: "var(--p-color-bg-surface-secondary)",
                }}
              >
                <InlineStack align="space-between" blockAlign="center" gap="200" wrap>
                  <div style={{ minWidth: 180, maxWidth: 320, flex: "1 1 220px" }}>
                    <TextField
                      label=""
                      labelHidden
                      autoComplete="off"
                      placeholder="z.B. Größe"
                      value={option.name}
                      onChange={(val) => {
                        const updated = [...editOptions];
                        updated[oi] = { ...option, name: val };
                        setEditOptions(updated);
                      }}
                    />
                  </div>
                  <Button
                    tone="critical"
                    variant="plain"
                    size="slim"
                    disabled={(option.values ?? []).length > 0}
                    onClick={() => setEditOptions((prev) => prev.filter((_, i) => i !== oi))}
                  >
                    Löschen
                  </Button>
                </InlineStack>

                <InlineStack gap="100" wrap blockAlign="center" align="start" style={{ marginTop: 10 }}>
                  {(option.values ?? []).map((v, vi) => (
                    <span
                      key={`${oi}-${v}-${vi}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 8px 4px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--p-color-border)",
                        background: "var(--p-color-bg-surface)",
                      }}
                    >
                      <input
                        value={v}
                        onChange={(e) => {
                          const updated = [...editOptions];
                          const nextValues = [...(option.values ?? [])];
                          nextValues[vi] = e.target.value;
                          updated[oi] = { ...option, values: nextValues };
                          setEditOptions(updated);
                        }}
                        style={{
                          border: "none",
                          outline: "none",
                          background: "transparent",
                          minWidth: Math.max(24, String(v ?? "").length * 8),
                          width: "auto",
                          fontSize: 13,
                          lineHeight: 1.2,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...editOptions];
                          updated[oi] = { ...option, values: option.values.filter((_, j) => j !== vi) };
                          setEditOptions(updated);
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          padding: 0,
                          color: "var(--p-color-text-subdued)",
                          lineHeight: 1,
                          fontSize: 14,
                        }}
                        aria-label={`Wert ${v} entfernen`}
                        title="Entfernen"
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  <div style={{ minWidth: 140, maxWidth: 220, flex: "1 1 160px" }}>
                    <TextField
                      label=""
                      labelHidden
                      autoComplete="off"
                      placeholder="+ Wert"
                      value={newValues[oi] ?? ""}
                      onChange={(val) => setNewValues(prev => ({ ...prev, [oi]: val }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (newValues[oi]?.trim()) {
                            const updated = [...editOptions];
                            updated[oi] = { ...option, values: [...option.values, newValues[oi].trim()] };
                            setEditOptions(updated);
                            setNewValues(prev => ({ ...prev, [oi]: "" }));
                          }
                        }
                      }}
                    />
                  </div>

                  <Button
                    size="slim"
                    onClick={() => {
                      if (newValues[oi]?.trim()) {
                        const updated = [...editOptions];
                        updated[oi] = { ...option, values: [...option.values, newValues[oi].trim()] };
                        setEditOptions(updated);
                        setNewValues(prev => ({ ...prev, [oi]: "" }));
                      }
                    }}
                  >
                    + Wert
                  </Button>
                </InlineStack>
              </div>
            ))}
            <Button
              size="slim"
              disabled={(editOptions?.length ?? 0) >= 2}
              onClick={() => setEditOptions((prev) => [...prev, { name: "", values: [] }])}
            >
              + Neue Option
            </Button>
          </BlockStack>
        </>
      )}

      {/* Variantentabelle */}
      {hasRealOptions && variants && variants.length > 0 && (
        <>
          <Divider />
          <Text variant="headingSm">Varianten</Text>

          {/* SKU-Generator */}
          <InlineStack gap="200" blockAlign="end">
            <div style={{ width: 200 }}>
              <TextField
                label="SKU-Präfix"
                labelHidden={false}
                autoComplete="off"
                placeholder="z.B. 12345"
                helpText="Präfix + Kürzel der Option-Werte"
                value={skuPrefix}
                onChange={setSkuPrefix}
              />
            </div>
            <Button
              disabled={!skuPrefix.trim()}
              onClick={() => {
                const updated = previewVariants.map(v => {
                  const optionValues = (v.selectedOptions ?? []).map(o => o.value);
                  return { ...v, sku: generateSku(skuPrefix, optionValues) };
                });
                setPreviewVariants(updated);
                setEditVariants(updated);
              }}
            >
              SKU generieren
            </Button>
            <Text variant="bodySm" tone="subdued" as="span">
              {skuPrefix.trim() && previewVariants[0]
                ? `→ ${generateSku(skuPrefix, (previewVariants[0].selectedOptions ?? []).map(o => o.value))}, …`
                : ""}
            </Text>
          </InlineStack>

          <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 70px 90px 90px 50px", gap: 8 }}>
            <div />
            <Text variant="bodySm" tone="subdued">Variante</Text>
            <Text variant="bodySm" tone="subdued">Preis (€)</Text>
            <Text variant="bodySm" tone="subdued">Vergleich (€)</Text>
            <Text variant="bodySm" tone="subdued">Lager</Text>
            <Text variant="bodySm" tone="subdued">SKU</Text>
            <Text variant="bodySm" tone="subdued">Barcode</Text>
            <Text variant="bodySm" tone="subdued">Aktiv</Text>
          </div>
          {previewVariants.map((v, vi) => {
            const assignedImage = localImages.find(img => img.id === v.imageId);
            return (
              <div key={vi} style={{
                display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 70px 90px 90px 50px",
                gap: 8, alignItems: "center",
                opacity: v.active === false ? 0.4 : 1,
              }}>
                {/* Bild-Picker Button */}
                <div
                  onClick={(e) => { e.stopPropagation(); setVariantImagePicker(variantImagePicker === vi ? null : vi); }}
                  style={{
                    width: 36, height: 36, borderRadius: 6, overflow: "hidden",
                    border: `2px solid ${variantImagePicker === vi ? "var(--p-color-border-focus)" : "var(--p-color-border)"}`,
                    cursor: "pointer", background: "var(--p-color-bg-surface-secondary)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {assignedImage
                    ? <img src={assignedImage.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ fontSize: 16, color: "var(--p-color-text-secondary)" }}>＋</span>
                  }
                </div>

                <Text variant="bodySm">
                  <span style={{ color: (v.inventoryQuantity ?? 0) === 0 ? "#f97316" : undefined }}>
                    {v.title} {(v.inventoryQuantity ?? 0) === 0 ? "⚠" : ""}
                  </span>
                </Text>

                <TextField label="" labelHidden type="number" autoComplete="off"
                  value={String(v.price)}
                  onChange={(val) => updateVariant(vi, { price: val })}
                />

                <TextField label="" labelHidden type="number" autoComplete="off"
                  value={String(v.compareAtPrice ?? "")}
                  onChange={(val) => updateVariant(vi, { compareAtPrice: val })}
                  placeholder="—"
                />

                <div style={{ position: "relative" }}>
                  <TextField label="" labelHidden type="number" autoComplete="off"
                    value={String(v.inventoryQuantity ?? 0)}
                    onChange={(val) => updateVariant(vi, { inventoryQuantity: val })}
                  />
                  {(v.inventoryQuantity ?? 0) === 0 && (
                    <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "#f97316", fontSize: 14 }}>⚠</span>
                  )}
                </div>

                {/* SKU mit Duplikat- und Konventions-Prüfung */}
                <SkuField
                  value={v.sku ?? ""}
                  onChange={(val) => updateVariant(vi, { sku: val })}
                  productId={productId}
                />
                
                {/* Barcode */}
                <TextField label="" labelHidden autoComplete="off"
                  value={String(v.barcode ?? "")}
                  onChange={(val) => updateVariant(vi, { barcode: val })}
                  placeholder="—"
                />

                {/* Bild-Picker Dropdown */}
                {variantImagePicker === vi && (
                  <div style={{
                    gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 8,
                    padding: 8, background: "var(--p-color-bg-surface-secondary)",
                    borderRadius: 8, border: "1px solid var(--p-color-border)",
                  }}>
                    {localImages.length === 0 && <Text tone="subdued" variant="bodySm">Keine Bilder — zuerst hochladen.</Text>}
                    <div onClick={() => { updateVariant(vi, { imageId: null }); setVariantImagePicker(null); }}
                      style={{
                        width: 48, height: 48, borderRadius: 6, cursor: "pointer",
                        border: `2px solid ${v.imageId === null ? "var(--p-color-border-focus)" : "var(--p-color-border)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "var(--p-color-bg-surface)", fontSize: 10,
                        color: "var(--p-color-text-secondary)", textAlign: "center",
                      }}>Kein<br />Bild</div>
                    {localImages.map(img => (
                      <div key={img.id} onClick={() => { updateVariant(vi, { imageId: img.id }); setVariantImagePicker(null); }}
                        style={{
                          width: 48, height: 48, borderRadius: 6, overflow: "hidden", cursor: "pointer",
                          border: `2px solid ${v.imageId === img.id ? "var(--p-color-border-focus)" : "var(--p-color-border)"}`,
                        }}>
                        <img src={img.url} alt={img.altText ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Aktiv Toggle */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    onClick={() => updateVariant(vi, { active: v.active === false ? true : false })}
                    title={v.active === false ? "Aktivieren" : "Deaktivieren"}
                    style={{
                      background: v.active === false ? "#e0e0e0" : "#22c55e",
                      border: "none", borderRadius: 12, width: 40, height: 22,
                      cursor: "pointer", position: "relative", transition: "background 0.2s",
                    }}
                  >
                    <span style={{
                      position: "absolute", top: 2, left: v.active === false ? 2 : 20,
                      width: 18, height: 18, background: "white", borderRadius: "50%",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    }} />
                  </button>
                </div>
              </div>
            );
          })}
        </>
      )}
    </BlockStack>
  );
}
