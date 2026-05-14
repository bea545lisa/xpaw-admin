import { useState, useRef, useMemo } from "react";
import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";

export default function ProductDetailInfos({
  product, fetcher, formatDate, totalStock, hasZeroStock,
  allVendors = [], allProductTypes = [], setToast,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
  });
  const [showVendor, setShowVendor] = useState(false);
  const [showType, setShowType] = useState(false);
  const vendorRef = useRef(null);
  const typeRef = useRef(null);

  const vendorSuggestions = useMemo(() =>
    allVendors.filter((v) => v.toLowerCase().includes(draft.vendor.toLowerCase())).slice(0, 8),
    [allVendors, draft.vendor]
  );

  const typeSuggestions = useMemo(() =>
    allProductTypes.filter((v) => v.toLowerCase().includes(draft.productType.toLowerCase())).slice(0, 8),
    [allProductTypes, draft.productType]
  );

  const handleSave = () => {
    fetcher.submit(
      { action: "updateOrganization", id: product.id, vendor: draft.vendor, productType: draft.productType },
      { method: "POST" }
    );
    setEditing(false);
    setToast?.("Produktinfos gespeichert");

  };

  const dropdownItem = {
    padding: "8px 12px", cursor: "pointer", fontSize: 13,
    borderBottom: "1px solid var(--p-color-border-subdued)",
  };

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="headingSm">Produktinfos</Text>
          {!editing && (
            <Button size="micro" onClick={() => setEditing(true)}>Bearbeiten</Button>
          )}
        </InlineStack>
        <Divider />

        {editing ? (
          <BlockStack gap="300">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ position: "relative" }}>
                <div ref={vendorRef}>
                  <TextField
                    label="Hersteller"
                    value={draft.vendor}
                    onChange={(val) => setDraft((d) => ({ ...d, vendor: val }))}
                    onFocus={() => setShowVendor(true)}
                    onBlur={() => setTimeout(() => setShowVendor(false), 150)}
                    autoComplete="off"
                  />
                </div>
                <PositionedDropdown anchorRef={vendorRef} open={showVendor && vendorSuggestions.length > 0}>
                  {vendorSuggestions.map((v) => (
                    <div key={v} style={dropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); setDraft((d) => ({ ...d, vendor: v })); setShowVendor(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{v}</div>
                  ))}
                </PositionedDropdown>
              </div>

              <div style={{ position: "relative" }}>
                <div ref={typeRef}>
                  <TextField
                    label="Produkttyp"
                    value={draft.productType}
                    onChange={(val) => setDraft((d) => ({ ...d, productType: val }))}
                    onFocus={() => setShowType(true)}
                    onBlur={() => setTimeout(() => setShowType(false), 150)}
                    autoComplete="off"
                  />
                </div>
                <PositionedDropdown anchorRef={typeRef} open={showType && typeSuggestions.length > 0}>
                  {typeSuggestions.map((t) => (
                    <div key={t} style={dropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); setDraft((d) => ({ ...d, productType: t })); setShowType(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{t}</div>
                  ))}
                </PositionedDropdown>
              </div>
            </div>

            <InlineStack gap="200" align="end">
              <Button size="slim" onClick={() => setEditing(false)}>Abbrechen</Button>
              <Button variant="primary" size="slim" onClick={handleSave}>Speichern</Button>
            </InlineStack>
          </BlockStack>
        ) : (
          <BlockStack gap="100">
            {[
              ["Hersteller", product.vendor || "—"],
              ["Typ", product.productType || "—"],
              ["Erstellt", formatDate(product.createdAt)],
              ["Aktualisiert", formatDate(product.updatedAt)],
              ["Gesamtlager", (
                <span key="lager" style={{ color: hasZeroStock ? "#f97316" : "inherit" }}>
                  {totalStock} {hasZeroStock ? "⚠" : ""}
                </span>
              )],
            ].map(([label, value]) => (
              <InlineStack key={label} align="space-between">
                <Text tone="subdued" variant="bodySm">{label}</Text>
                <Text variant="bodySm">{value}</Text>
              </InlineStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>
    </Card>
  );
}
