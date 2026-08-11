import { Card, BlockStack, Text, InlineStack, Divider, Badge, Tabs, Button, TextField, Spinner, Icon, InlineError } from "@shopify/polaris";
import { EditIcon, XIcon } from "@shopify/polaris-icons";
import ProductDetailOptions from "./ProductDetailOptions.jsx";
import ProductDetailMetafields from "./ProductDetailMetafields.jsx";
import { useEffect, useState, useRef, useCallback } from "react";
import { useFetcher } from "react-router";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";
import { buildSkuValidator } from "../../../utils/skuFormat.js";

// ── SKU-Feld mit Konventions- und Duplikat-Prüfung ───────────────────────────
function SkuField({ value, onChange, productId, skuFormat, selectedOptions }) {
  const fetcher = useFetcher();
  const timerRef = useRef(null);
  const lastChecked = useRef("");

  // expectedParts: 1 Präfix + 1 pro Option (null wenn keine Optionen vorhanden)
  const expectedParts = selectedOptions?.length > 0 ? 1 + selectedOptions.length : null;
  const validateConvention = useCallback(buildSkuValidator(skuFormat, expectedParts), [skuFormat, expectedParts]);

  const checkDuplicate = useCallback((sku) => {
    if (!sku?.trim() || sku === lastChecked.current) return;
    lastChecked.current = sku;
    fetcher.submit(
      { action: "checkSku", sku: sku.trim(), excludeId: productId ?? "" },
      { method: "post", action: "/app/products" },
    );
  }, [productId]);

  const handleChange = (val) => {
    onChange(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => checkDuplicate(val), 600);
  };

  const isDuplicate = fetcher.data?.exists === true;
  const conventionWarning = !isDuplicate ? validateConvention(value) : null;

  const error = isDuplicate ? `SKU bereits vergeben (${fetcher.data.productTitle})` : undefined;

  return (
    <BlockStack gap="100">
      <TextField
        label="SKU"
        value={value}
        onChange={handleChange}
        autoComplete="off"
        error={error}
      />
      {conventionWarning && (
        <span style={{ fontSize: 12, color: "#b45309" }}>⚠ {conventionWarning}</span>
      )}
    </BlockStack>
  );
}

// ── Varianten-Metafields: eigene, per Variante gepflegte Custom-Felder (z.B. "Maße") ──────────
function VariantMetafields({ variant, isDark, setToast, setLocalVariants }) {
  const fetcher = useFetcher();
  const [fields, setFields] = useState(
    (variant.metafields?.edges ?? []).map((e) => e.node)
  );
  const [drafts, setDrafts] = useState({}); // metafieldId -> value
  const [newField, setNewField] = useState({ key: "", value: "" });
  const [adding, setAdding] = useState(false);

  // Änderungen zusätzlich in localVariants (übergeordneter State) spiegeln — sonst zeigt das Panel
  // beim erneuten Öffnen (ohne vollen Seiten-Reload) wieder den alten Stand, da diese Komponente
  // beim Schließen/Öffnen neu gemountet wird und ihren Startwert wieder aus der variant-Prop liest.
  const syncLocalVariants = (nextFieldNodes) => {
    setLocalVariants?.((prev) => prev.map((lv) =>
      lv.id === variant.id ? { ...lv, metafields: { edges: nextFieldNodes.map((node) => ({ node })) } } : lv
    ));
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data;
    if (d.type === "createVariantMetafield") {
      if (d.ok && d.metafield) {
        setFields((prev) => {
          const next = [...prev, d.metafield];
          syncLocalVariants(next);
          return next;
        });
        setNewField({ key: "", value: "" });
        setAdding(false);
        setToast?.("Meta-Feld angelegt");
      } else {
        setToast?.(`Fehler: ${d.userErrors?.[0]?.message || "Feld konnte nicht angelegt werden"}`);
      }
    }
    if (d.type === "updateVariantMetafield") {
      if (d.ok) {
        setFields((prev) => {
          const next = prev.map((f) => f.id === d.metafieldId ? { ...f, value: d.value } : f);
          syncLocalVariants(next);
          return next;
        });
        setToast?.("Meta gespeichert");
      } else {
        setToast?.(`Fehler: ${d.userErrors?.[0]?.message || "Wert konnte nicht gespeichert werden"}`);
      }
    }
    if (d.type === "deleteVariantMetafield" && d.ok) {
      setFields((prev) => {
        const next = prev.filter((f) => f.id !== d.metafieldId);
        syncLocalVariants(next);
        return next;
      });
      setToast?.("Meta-Feld entfernt");
    }
  }, [fetcher.state, fetcher.data]);

  const saveExisting = (field) => {
    const value = drafts[field.id];
    if (value === undefined) return; // nichts getippt, kein Save nötig
    fetcher.submit(
      { action: "updateVariantMetafield", variantId: variant.id, metafieldId: field.id, namespace: field.namespace, key: field.key, type: field.type, value },
      { method: "POST" }
    );
  };

  const deleteField = (field) => {
    fetcher.submit(
      { action: "deleteVariantMetafield", variantId: variant.id, metafieldId: field.id, namespace: field.namespace, key: field.key },
      { method: "POST" }
    );
  };

  const addField = () => {
    const key = newField.key.trim();
    if (!key || !newField.value.trim()) return;
    fetcher.submit(
      { action: "createVariantMetafield", variantId: variant.id, namespace: "custom", key, type: "single_line_text_field", name: key, value: newField.value },
      { method: "POST" }
    );
  };

  return (
    <div style={{
      padding: 10, borderRadius: 8,
      border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
      background: isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)",
    }}>
      <BlockStack gap="150">
        <Text variant="bodySm" fontWeight="semibold">Metafields (nur diese Variante)</Text>
        {fields.map((field) => (
          <InlineStack key={field.id} gap="100" blockAlign="center" wrap={false}>
            <div style={{ width: 110, flexShrink: 0 }}>
              <Text variant="bodyXs" tone="subdued">{field.definition?.name || field.key}</Text>
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="" labelHidden autoComplete="off"
                value={drafts[field.id] ?? field.value}
                onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: val }))}
                onBlur={() => saveExisting(field)}
              />
            </div>
            {drafts[field.id] !== undefined && drafts[field.id] !== field.value && (
              <Button size="slim" onClick={() => saveExisting(field)}>✓</Button>
            )}
            <button
              onClick={() => deleteField(field)}
              style={{
                background: "transparent", border: "1px solid var(--p-color-border)",
                borderRadius: 4, cursor: "pointer", width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0,
              }}
              title="Feld entfernen"
            >
              <Icon source={XIcon} tone="subdued" />
            </button>
          </InlineStack>
        ))}

        {adding ? (
          <InlineStack gap="100" blockAlign="center" wrap={false}>
            <div style={{ width: 110, flexShrink: 0 }}>
              <TextField label="" labelHidden autoComplete="off" placeholder="z.B. Maße" value={newField.key} onChange={(val) => setNewField((f) => ({ ...f, key: val }))} />
            </div>
            <div style={{ flex: 1 }}>
              <TextField label="" labelHidden autoComplete="off" placeholder="Wert" value={newField.value} onChange={(val) => setNewField((f) => ({ ...f, value: val }))} />
            </div>
            <Button size="slim" onClick={addField}>✓</Button>
            <Button size="slim" onClick={() => { setAdding(false); setNewField({ key: "", value: "" }); }}>✕</Button>
          </InlineStack>
        ) : (
          <Button size="slim" onClick={() => setAdding(true)}>+ Feld hinzufügen</Button>
        )}
      </BlockStack>
    </div>
  );
}

export default function ProductDetailTabs({
     selectedDetailTab, setSelectedDetailTab, detailTabs,
     optionDrafts, setOptionDrafts, optionsDirty, handleOptionsSave, optionsNotice,
     hasVariants, localVariants, setLocalVariants, defaultVariant, totalVariants,
     variantDraft, setVariantDraft,
     editingVariantId, setEditingVariantId,
     openVariantEdit, handleVariantSave, isSaving,
     metafields, allMetafieldDefinitions, defaultMetafieldOrder, locales, shopId, fieldLabels, optionSwatches, allOptionNames, product, fetcher, setToast,
     localImages, onVariantImageAssign,
     skuFormat,
   }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const cols = "32px 1fr 85px 95px 80px 80px 50px 32px";
  const cellStyle = (align = "left") => ({
    fontSize: 13, textAlign: align,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  });

  const [pickingImageForVariantId, setPickingImageForVariantId] = useState(null);

  useEffect(() => {
    if (fetcher.data?.type === "updateVariantAll") {
      if (fetcher.data.ok === false) {
        setToast?.(`Fehler: ${fetcher.data.error || "Variante konnte nicht gespeichert werden"}`);
      } else {
        setToast?.("Variante gespeichert");
      }
    }
  }, [fetcher.data]);

  return (
    <Card>
      <BlockStack gap="300">
        <div style={{ marginLeft: -16 }}>
          <Tabs tabs={detailTabs} selected={selectedDetailTab} onSelect={setSelectedDetailTab} />
        </div>
      </BlockStack>

      <div style={{ height: 20 }} />

      {selectedDetailTab === 0 ? (
        <BlockStack gap="300">
          <ProductDetailOptions
            optionDrafts={optionDrafts}
            setOptionDrafts={setOptionDrafts}
            optionsDirty={optionsDirty}
            handleOptionsSave={handleOptionsSave}
            optionsNotice={optionsNotice}
            setToast={setToast}
            locales={locales}
            productId={product.id}
            productImages={product.images?.edges?.map((e) => e.node) ?? []}
            optionSwatches={optionSwatches}
            allOptionNames={allOptionNames}
          />

          <div style={{ borderTop: `1px dashed ${isDark ? "#6b6b6b" : "#c4c4c4"}` }} />
          <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingSm">
                  {hasVariants ? `Varianten (${totalVariants})` : "Preis & Lager"}
                </Text>
                {isSaving && <Spinner size="small" />}
              </InlineStack>
              <Divider />

              {!hasVariants && defaultVariant ? (
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Text variant="bodySm" fontWeight="semibold">Standard</Text>
                    </InlineStack>
                    <Text tone="subdued" variant="bodySm">
                      SKU: {defaultVariant.sku || "—"} · Barcode: {defaultVariant.barcode || "—"}
                    </Text>
                  </InlineStack>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    <TextField label="Preis (€)" value={variantDraft.price} onChange={(val) => setVariantDraft((d) => ({ ...d, price: val }))} type="number" autoComplete="off" />
                    <TextField label="Vergleichspreis (€)" value={variantDraft.compareAtPrice} onChange={(val) => setVariantDraft((d) => ({ ...d, compareAtPrice: val }))} type="number" autoComplete="off" placeholder="leer = kein SALE" />
                    <TextField label="Lagerbestand" value={variantDraft.inventoryQuantity} onChange={(val) => setVariantDraft((d) => ({ ...d, inventoryQuantity: val }))} type="number" autoComplete="off" />
                    <SkuField value={variantDraft.sku} onChange={(val) => setVariantDraft((d) => ({ ...d, sku: val }))} productId={product?.id} skuFormat={skuFormat} selectedOptions={[]} />
                    <TextField label="Barcode" value={variantDraft.barcode} onChange={(val) => setVariantDraft((d) => ({ ...d, barcode: val }))} autoComplete="off" />
                  </div>

                  <InlineStack gap="200">
                    <Button variant="primary" size="slim" onClick={() => handleVariantSave(defaultVariant)} loading={isSaving}>Speichern</Button>
                    <Button size="slim" onClick={() => setVariantDraft({
                      price: String(defaultVariant.price ?? ""),
                      compareAtPrice: String(defaultVariant.compareAtPrice ?? ""),
                      inventoryQuantity: String(defaultVariant.inventoryQuantity ?? 0),
                      sku: defaultVariant.sku ?? "",
                      barcode: defaultVariant.barcode ?? "",
                    })}>Zurücksetzen</Button>
                  </InlineStack>
                </BlockStack>

              ) : (
                <BlockStack gap="0">
                  <div style={{
                    display: "grid", gridTemplateColumns: cols,
                    gap: 8, alignItems: "center",
                    padding: "0 4px 6px",
                    borderBottom: "1px solid var(--p-color-border-subdued)",
                  }}>
                    <div /><Text variant="bodySm" tone="subdued">Variante</Text>
                    <Text variant="bodySm" tone="subdued">SKU</Text>
                    <Text variant="bodySm" tone="subdued">Barcode</Text>
                    <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Preis</Text></div>
                    <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Vgl.preis</Text></div>
                    <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Lager</Text></div>
                    <div />
                  </div>

                  {localVariants.map((v) => {

                    const isSale = v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price);
                    const isEditing = editingVariantId === v.id;
                    const outOfStock = (v.inventoryQuantity ?? 0) === 0;

                    return (

                      <div key={v.id} style={{
                        borderBottom: "1px solid var(--p-color-border-subdued)",
                      }}>

                        {/* Tabellenzeile */}
                        <div style={{
                          display: "grid", gridTemplateColumns: cols,
                          gap: 8, alignItems: "center", padding: "8px 4px",
                        }}>
                          <div
                            onClick={() => setPickingImageForVariantId(v.id)}
                            style={{
                              width: 32, height: 32, borderRadius: 4, overflow: "hidden",
                              border: "1px solid var(--p-color-border)",
                              background: "var(--p-color-bg-surface-secondary)",
                              flexShrink: 0, cursor: "pointer",
                              position: "relative",
                            }}
                            title="Bild zuweisen"
                          >
                            {v.image?.url
                              ? <img src={v.image.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <div style={{ width: "100%", height: "100%" }} />}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                            <span style={{ ...cellStyle(), color: outOfStock ? "tomato" : "inherit" }}>
                              {hasVariants ? v.title : "Standard"}
                            </span>
                            {outOfStock && <span style={{ fontSize: 11, flexShrink: 0, color: "tomato" }}>⚠</span>}
                            {isSale && <span style={{ fontSize: "10px", background: isDark ? "#3a1a1a" : "#fee2e2", color: isDark ? "#f87171" : "#dc2626", borderRadius: 999, padding: "3px 8px", fontWeight: 600, flexShrink: 0 }}>SALE</span>}
                          </div>

                          <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>{v.sku || "—"}</span>
                          <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>{v.barcode || "—"}</span>

                          <div style={{ textAlign: "right" }}>
                            {isSale && <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through", lineHeight: 1.2 }}>€{parseFloat(v.compareAtPrice).toFixed(2)}</div>}
                            <span style={{ fontSize: 13, color: isSale ? "tomato" : "inherit" }}>€{parseFloat(v.price).toFixed(2)}</span>
                          </div>

                          <span style={{ ...cellStyle("right"), color: "var(--p-color-text-secondary)", textDecoration: isSale ? "line-through" : "none" }}>
                            {v.compareAtPrice ? `€${parseFloat(v.compareAtPrice).toFixed(2)}` : "—"}
                          </span>

                          <span style={{ ...cellStyle("right"), color: outOfStock ? "tomato" : "var(--p-color-text-secondary)" }}>
                            {v.inventoryQuantity ?? 0}
                          </span>

                          <button
                            onClick={() => isEditing ? setEditingVariantId(null) : openVariantEdit(v)}
                            style={{
                              background: isEditing ? "var(--p-color-bg-surface-selected)" : "transparent",
                              border: "1px solid var(--p-color-border)",
                              borderRadius: 4, cursor: "pointer",
                              width: 28, height: 28,
                              display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                            }}
                            title={isEditing ? "Schließen" : "Bearbeiten"}
                          >
                            <Icon source={isEditing ? XIcon : EditIcon} tone={isEditing ? "base" : "subdued"} />
                          </button>
                        </div>

                        {/* Bildpicker */}
                        {pickingImageForVariantId === v.id && (
                          <div style={{
                            padding: "10px 8px",
                            borderTop: "1px solid var(--p-color-border-subdued)",
                            background: "var(--p-color-bg-surface-secondary)",
                          }}>
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text variant="bodySm" fontWeight="semibold">Bild wählen</Text>
                                <button
                                  onClick={() => setPickingImageForVariantId(null)}
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                                >
                                  <Icon source={XIcon} tone="subdued" />
                                </button>
                              </InlineStack>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>

                                {/* Kein Bild Option */}
                                <div
                                  onClick={() => {
                                    onVariantImageAssign(
                                      v.id,
                                      null,
                                      v.mediaId
                                    );
                                    setPickingImageForVariantId(null);
                                  }}
                                  style={{
                                    width: 48, height: 48, borderRadius: 4,
                                    border: "2px dashed var(--p-color-border)",
                                    cursor: "pointer", display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    fontSize: 10, color: "var(--p-color-text-secondary)",
                                  }}
                                  title="Kein Bild"
                                >✕</div>

                                {localImages.map((img) => (
                                  <div
                                    key={img.id}
                                    onClick={() => {
                                      onVariantImageAssign(v.id, img.mediaId, v.mediaId);
                                      setPickingImageForVariantId(null);
                                    }}
                                    style={{
                                      width: 48, height: 48, borderRadius: 4, overflow: "hidden",
                                      border: v.mediaId === img.mediaId
                                        ? "2px solid var(--p-color-border-focus)"
                                        : "2px solid transparent",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <img src={img.url} alt={img.altText ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  </div>
                                ))}
                              </div>
                            </BlockStack>
                          </div>
                        )}

                        {/* Editbereich */}
                        {isEditing && (
                          <div style={{
                            padding: "12px 8px 16px",
                            borderTop: "1px solid var(--p-color-border-subdued)",
                            background: "var(--p-color-bg-surface-secondary)",
                          }}>
                            <BlockStack gap="300">
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                <TextField label="Preis (€)" value={variantDraft.price} onChange={val => setVariantDraft(d => ({ ...d, price: val }))} type="number" autoComplete="off" />
                                <TextField label="Vergleichspreis (€)" value={variantDraft.compareAtPrice} onChange={val => setVariantDraft(d => ({ ...d, compareAtPrice: val }))} type="number" autoComplete="off" placeholder="leer = kein SALE" />
                                <TextField label="Lagerbestand" value={variantDraft.inventoryQuantity} onChange={val => setVariantDraft(d => ({ ...d, inventoryQuantity: val }))} type="number" autoComplete="off" />
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                <SkuField value={variantDraft.sku} onChange={val => setVariantDraft(d => ({ ...d, sku: val }))} productId={product?.id} skuFormat={skuFormat} selectedOptions={v.selectedOptions ?? []} />
                                <TextField label="Barcode" value={variantDraft.barcode} onChange={val => setVariantDraft(d => ({ ...d, barcode: val }))} autoComplete="off" />
                              </div>
                              <VariantMetafields variant={v} isDark={isDark} setToast={setToast} setLocalVariants={setLocalVariants} />
                              <InlineStack gap="200">
                                <Button variant="primary" size="slim" onClick={() => handleVariantSave(v)} loading={isSaving}>Speichern</Button>
                                <Button size="slim" onClick={() => setEditingVariantId(null)}>Abbrechen</Button>
                              </InlineStack>
                            </BlockStack>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </BlockStack>
              )}
            </BlockStack>
          </BlockStack>

      ) : (
        <BlockStack gap="300">
          <ProductDetailMetafields
            metafields={metafields}
            allMetafieldDefinitions={allMetafieldDefinitions}
            defaultMetafieldOrder={defaultMetafieldOrder}
            locales={locales}
            shopId={shopId}
            fieldLabels={fieldLabels}
            productId={product.id}
            fetcher={fetcher}
            setToast={setToast}
          />
        </BlockStack>
      )}
    </Card>
  );
}
