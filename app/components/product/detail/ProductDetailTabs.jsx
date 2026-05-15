import { Card, BlockStack, Text, InlineStack, Divider, Badge, Tabs, Button, TextField, Spinner, Icon } from "@shopify/polaris";
import { EditIcon, XIcon } from "@shopify/polaris-icons";
import ProductDetailOptions from "./ProductDetailOptions.jsx";
import ProductDetailMetafields from "./ProductDetailMetafields.jsx";
import { useEffect, useState } from "react";

export default function ProductDetailTabs({
     selectedDetailTab, setSelectedDetailTab, detailTabs,
     optionDrafts, setOptionDrafts, optionsDirty, handleOptionsSave, optionsNotice,
     hasVariants, localVariants, defaultVariant, totalVariants,
     variantDraft, setVariantDraft,
     editingVariantId, setEditingVariantId,
     openVariantEdit, handleVariantSave, isSaving,
     metafields, product, fetcher, setToast,
     localImages, onVariantImageAssign,
   }) {

  const cols = "32px 1fr 85px 95px 80px 80px 50px 32px";
  const cellStyle = (align = "left") => ({
    fontSize: 13, textAlign: align,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  });

  const [pickingImageForVariantId, setPickingImageForVariantId] = useState(null);

  useEffect(() => {
    if (fetcher.data?.type === "updateVariantAll") {
      setToast?.("Variante gespeichert");
    }
  }, [fetcher.data]);

  return (
    <>
      <Card>
        <BlockStack gap="300">
          <Tabs tabs={detailTabs} selected={selectedDetailTab} onSelect={setSelectedDetailTab} />
        </BlockStack>
      </Card>

      {selectedDetailTab === 0 ? (
        <>
          <ProductDetailOptions
            optionDrafts={optionDrafts}
            setOptionDrafts={setOptionDrafts}
            optionsDirty={optionsDirty}
            handleOptionsSave={handleOptionsSave}
            optionsNotice={optionsNotice}
            setToast={setToast}
          />

          <Card>
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
                    <TextField label="SKU" value={variantDraft.sku} onChange={(val) => setVariantDraft((d) => ({ ...d, sku: val }))} autoComplete="off" />
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
                        background: outOfStock && !isEditing ? "#fff7ed" : "transparent",
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
                            <span style={{ ...cellStyle(), color: outOfStock ? "#f97316" : "inherit" }}>
                              {hasVariants ? v.title : "Standard"}
                            </span>
                            {outOfStock && <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>}
                            {isSale && <span style={{ fontSize: "10px", background: "#fee2e2", color: "#dc2626", borderRadius: 999, padding: "3px 8px", fontWeight: 600, flexShrink: 0 }}>SALE</span>}
                          </div>

                          <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>{v.sku || "—"}</span>
                          <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>{v.barcode || "—"}</span>

                          <div style={{ textAlign: "right" }}>
                            {isSale && <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through", lineHeight: 1.2 }}>€{parseFloat(v.compareAtPrice).toFixed(2)}</div>}
                            <span style={{ fontSize: 13, color: isSale ? "#dc2626" : "inherit" }}>€{parseFloat(v.price).toFixed(2)}</span>
                          </div>

                          <span style={{ ...cellStyle("right"), color: "var(--p-color-text-secondary)", textDecoration: isSale ? "line-through" : "none" }}>
                            {v.compareAtPrice ? `€${parseFloat(v.compareAtPrice).toFixed(2)}` : "—"}
                          </span>

                          <span style={{ ...cellStyle("right"), color: outOfStock ? "#f97316" : "var(--p-color-text-secondary)" }}>
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
                                <TextField label="SKU" value={variantDraft.sku} onChange={val => setVariantDraft(d => ({ ...d, sku: val }))} autoComplete="off" />
                                <TextField label="Barcode" value={variantDraft.barcode} onChange={val => setVariantDraft(d => ({ ...d, barcode: val }))} autoComplete="off" />
                              </div>
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
          </Card>
        </>

      /*) : selectedDetailTab === 1 ? (
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingSm">Shipping</Text>
              <Text variant="bodySm" tone="subdued">Versand pro Variante</Text>
            </InlineStack>
            <Divider />
            <BlockStack gap="200">
              {localVariants.map((variant) => (
                <div key={variant.id} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 8, border: "1px solid var(--p-color-border-subdued)" }}>
                  <InlineStack align="space-between" blockAlign="center" wrap>
                    <Text variant="bodySm" fontWeight="semibold">{variant.title || "Standard"}</Text>
                    <Badge tone={variant.inventoryItem?.requiresShipping ? "success" : "warning"}>
                      {variant.inventoryItem?.requiresShipping ? "Versand erforderlich" : "Kein Versand"}
                    </Badge>
                  </InlineStack>
                  <Text variant="bodySm" tone="subdued">
                    {variant.inventoryItem?.tracked ? "Inventar wird verfolgt" : "Inventar wird nicht verfolgt"}
                  </Text>
                </div>
              ))}
            </BlockStack>
          </BlockStack>
        </Card>
      */
      ) : (
        <ProductDetailMetafields
          metafields={metafields}
          productId={product.id}
          fetcher={fetcher}
          setToast={setToast}
        />
      )}
    </>
  );
}
