import { TextField, Text, BlockStack, InlineStack, Divider, Button, Tag, } from "@shopify/polaris";
import { useState, useEffect, useRef } from "react";

function computeVariantCombinations(options, existingVariants) {
  if (!options || options.length === 0) return [];
  const optionValues = options.map(o => o.values.filter(v => v.trim() !== ""));
  if (optionValues.some(v => v.length === 0)) return [];
  const combinations = optionValues.reduce((acc, values) => {
    if (acc.length === 0) return values.map(v => [v]);
    return acc.flatMap(combo => values.map(v => [...combo, v]));
  }, []);
  return combinations.map(combo => {
    const title = combo.join(" / ");
    const existing = existingVariants?.find(v => v.title === title);
    if (existing) return { ...existing };
    return { id: null, title, price: "0.00", compareAtPrice: "", inventoryQuantity: 0, imageId: null, active: true };
  });
}

export default function VariantsSection({
  variants, editOptions, setEditOptions, setEditVariants, localImages,
}) {
  const [newValues, setNewValues] = useState({});
  const [previewVariants, setPreviewVariants] = useState([]);
  const [variantImagePicker, setVariantImagePicker] = useState(null);
  const isFirstRender = useRef(true);

  const hasRealOptions = editOptions && editOptions.length > 0;
  const defaultVariant = variants?.length === 1 && variants[0]?.title === "Default Title" ? variants[0] : null;
  
  const updateVariant = (variantIndex, changes) => {
    const updated = [...previewVariants];
    updated[variantIndex] = { ...updated[variantIndex], ...changes };
    setPreviewVariants(updated);
    setEditVariants(updated);
  };

  useEffect(() => {
    if (!hasRealOptions) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setPreviewVariants(computeVariantCombinations(editOptions, variants));
      return;
    }
    const computed = computeVariantCombinations(editOptions, previewVariants);
    setPreviewVariants(computed);
    setEditVariants(computed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOptions]);

  useEffect(() => {
    if (hasRealOptions && variants?.length > 0) {
      isFirstRender.current = true; // reset
      setPreviewVariants(computeVariantCombinations(editOptions, variants));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variants]);
  
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
              <TextField
                label="SKU" autoComplete="off"
                value={String(defaultVariant.sku ?? "")}
                onChange={(val) => setEditVariants([{ ...defaultVariant, sku: val }])}
                placeholder="—"
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}>
            <Text variant="bodySm" tone="subdued">Name</Text>
            <Text variant="bodySm" tone="subdued">Werte</Text>
            <Text variant="bodySm" tone="subdued">Wert hinzufügen</Text>
            <div style={{ width: 32 }} />
          </div>
          {editOptions.map((option, oi) => (
            <div key={option.id ?? oi} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "center" }}>
              <TextField
                label="" labelHidden autoComplete="off" placeholder="z.B. Größe"
                value={option.name}
                onChange={(val) => {
                  const updated = [...editOptions];
                  updated[oi] = { ...option, name: val };
                  setEditOptions(updated);
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {option.values.map((v, vi) => (
                  <Tag key={`${oi}-${v}`} onRemove={() => {
                    const updated = [...editOptions];
                    updated[oi] = { ...option, values: option.values.filter((_, j) => j !== vi) };
                    setEditOptions(updated);
                  }}>{v}</Tag>
                ))}
              </div>
              <InlineStack gap="100" blockAlign="center">
                <div style={{ flex: 1 }}>
                  <TextField
                    label="" labelHidden autoComplete="off" placeholder="Wert..."
                    value={newValues[oi] ?? ""}
                    onChange={(val) => setNewValues(prev => ({ ...prev, [oi]: val }))}
                  />
                </div>
                <Button size="slim" onClick={() => {
                  if (newValues[oi]?.trim()) {
                    const updated = [...editOptions];
                    updated[oi] = { ...option, values: [...option.values, newValues[oi].trim()] };
                    setEditOptions(updated);
                    setNewValues(prev => ({ ...prev, [oi]: "" }));
                  }
                }}>+</Button>
              </InlineStack>
              <Button tone="critical" size="slim"
                disabled={option.values.length > 0}
                onClick={() => setEditOptions(prev => prev.filter((_, i) => i !== oi))}
              >✕</Button>
            </div>
          ))}
        </>
      )}

      {/* Neue Option */}
      <Button size="slim" disabled={editOptions.length >= 2}
        onClick={() => setEditOptions(prev => [...prev, { name: "", values: [] }])}>
        + Neue Option
      </Button>

      {/* Variantentabelle */}
      {hasRealOptions && variants && variants.length > 0 && (
        <>
          <Divider />
          <Text variant="headingSm">Varianten</Text>
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

                {/* SKU */}
                <TextField label="" labelHidden autoComplete="off"
                  value={String(v.sku ?? "")}
                  onChange={(val) => updateVariant(vi, { sku: val })}
                  placeholder="—"
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