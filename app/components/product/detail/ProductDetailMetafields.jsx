import { useState, useRef, useEffect } from "react";
import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField, Select, Icon } from "@shopify/polaris";
import { EditIcon, XIcon } from "@shopify/polaris-icons";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";

const TYPE_OPTIONS = [
  { label: "Single line text", value: "single_line_text_field" },
  { label: "Multi line text", value: "multi_line_text_field" },
  { label: "Integer", value: "number_integer" },
  { label: "Decimal", value: "number_decimal" },
  { label: "Boolean", value: "boolean" },
  { label: "Date", value: "date" },
  { label: "URL", value: "url" },
  { label: "JSON", value: "json" },
];

const EMPTY_NEW = { key: "", type: "single_line_text_field", value: "" };

export default function ProductDetailMetafields({ metafields, productId, fetcher, setToast }) {

  const [localMetafields, setLocalMetafields] = useState(metafields);
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newField, setNewField] = useState(EMPTY_NEW);
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const keyRef = useRef(null);
  const valueRef = useRef(null);

  // Autocomplete: Keys aus vorhandenen Metafields
  const existingKeys = [...new Set(localMetafields.map((f) => f.key))];
  const filteredKeys = existingKeys.filter((k) =>
    k.toLowerCase().includes(newField.key.toLowerCase())
  );

  // Autocomplete: Werte für den gewählten Key
  const valuesForKey = localMetafields
    .filter((f) => f.key === newField.key)
    .map((f) => f.value)
    .filter(Boolean);
  const filteredValues = valuesForKey.filter((v) =>
    v.toLowerCase().includes(newField.value.toLowerCase())
  );

  const openEdit = (field) => {
    setEditingId(field.id);
    setDrafts((prev) => ({ ...prev, [field.id]: field.value ?? "" }));
  };

  const handleSave = (field) => {
    fetcher.submit(
      { action: "updateMetafield", metafieldId: field.id, productId, value: drafts[field.id] ?? "" },
      { method: "POST" }
    );
    setEditingId(null);
    setToast?.("Metafield gespeichert");
  };

  const handleCreate = () => {
    if (!newField.key.trim()) return;
    fetcher.submit(
      { action: "createMetafield", productId, namespace: "custom", key: newField.key, type: newField.type, value: newField.value },
      { method: "POST" }
    );
    setShowNew(false);
    setNewField(EMPTY_NEW);
    setToast?.("Metafield erstellt");
  };

  const isMultiline = (type) => ["multi_line_text_field", "json"].includes(type);

  const dropdownItem = {
    padding: "8px 12px", cursor: "pointer", fontSize: 13,
    borderBottom: "1px solid var(--p-color-border-subdued)",
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.type === "updateMetafield") {
      setLocalMetafields(prev => prev.map(f =>
        f.id === fetcher.data.metafieldId
          ? { ...f, value: fetcher.data.value }
          : f
      ));
    }

    if (fetcher.data.type === "createMetafield" && fetcher.data.metafield) {
      setLocalMetafields(prev => [...prev, fetcher.data.metafield]);
    }
  }, [fetcher.state, fetcher.data]);

return (
  <Card>
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm">Metafields</Text>
        <Button size="micro" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Abbrechen" : "+ Neu"}
        </Button>
      </InlineStack>
      <Divider />

      {/* neu anlegen */}
      {showNew && (
        <div style={{
          padding: 12, borderRadius: 8,
          border: "1px dashed var(--p-color-border)",
          background: "var(--p-color-bg-surface-secondary)",
        }}>
          <BlockStack gap="200">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={{ position: "relative" }}>
                <div ref={keyRef}>
                  <TextField
                    label="Key"
                    value={newField.key}
                    onChange={(val) => { setNewField((f) => ({ ...f, key: val, value: "" })); setShowKeyDropdown(true); }}
                    onFocus={() => setShowKeyDropdown(true)}
                    onBlur={() => setTimeout(() => setShowKeyDropdown(false), 150)}
                    autoComplete="off"
                    placeholder="z.B. material"
                  />
                </div>
                <PositionedDropdown anchorRef={keyRef} open={showKeyDropdown && filteredKeys.length > 0}>
                  {filteredKeys.map((k) => (
                    <div key={k} style={dropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); setNewField((f) => ({ ...f, key: k, value: "" })); setShowKeyDropdown(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{k}</div>
                  ))}
                </PositionedDropdown>
              </div>

              <Select
                label="Typ"
                options={TYPE_OPTIONS}
                value={newField.type}
                onChange={(val) => setNewField((f) => ({ ...f, type: val }))}
              />

              <div style={{ position: "relative" }}>
                <div ref={valueRef}>
                  <TextField
                    label="Wert"
                    value={newField.value}
                    onChange={(val) => { setNewField((f) => ({ ...f, value: val })); setShowValueDropdown(true); }}
                    onFocus={() => setShowValueDropdown(true)}
                    onBlur={() => setTimeout(() => setShowValueDropdown(false), 150)}
                    autoComplete="off"
                  />
                </div>
                <PositionedDropdown anchorRef={valueRef} open={showValueDropdown && filteredValues.length > 0}>
                  {filteredValues.map((v) => (
                    <div key={v} style={dropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); setNewField((f) => ({ ...f, value: v })); setShowValueDropdown(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{v}</div>
                  ))}
                </PositionedDropdown>
              </div>
            </div>

            <InlineStack gap="200" align="end">
              <Button size="slim" onClick={() => { setShowNew(false); setNewField(EMPTY_NEW); }}>Abbrechen</Button>
              <Button variant="primary" size="slim" onClick={handleCreate} disabled={!newField.key.trim()}>
                Speichern
              </Button>
            </InlineStack>
          </BlockStack>
        </div>
      )}

      {/* bestehende editieren */}
      {metafields.length > 0 ? (
        <BlockStack gap="0">
          {localMetafields.map((field) => {
            const isEditing = editingId === field.id;
            return (
              <div key={field.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <div style={{ minWidth: 100 }}>
                      <Text variant="bodySm" fontWeight="semibold">{field.key}</Text>
                    </div>
                    {!isEditing && (
                      <Text variant="bodySm" tone="subdued">{field.value || "—"}</Text>
                    )}
                    {isEditing && (
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: 200 }}>
                          <TextField
                            label="" labelHidden
                            value={drafts[field.id] ?? ""}
                            onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: val }))}
                            multiline={isMultiline(field.type) ? 3 : undefined}
                            autoComplete="off"
                          />
                        </div>
                        <Button size="slim" onClick={() => setEditingId(null)}>Abbrechen</Button>
                        <Button variant="primary" size="slim" onClick={() => handleSave(field)}>Speichern</Button>
                      </InlineStack>
                    )}
                  </InlineStack>
                  <button
                    onClick={() => isEditing ? setEditingId(null) : openEdit(field)}
                    style={{
                      background: isEditing ? "var(--p-color-bg-surface-selected)" : "transparent",
                      border: "1px solid var(--p-color-border)",
                      borderRadius: 4, cursor: "pointer",
                      width: 28, height: 28,
                      display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <Icon source={isEditing ? XIcon : EditIcon} tone="subdued" />
                  </button>
                </InlineStack>
              </div>
            );
          })}
        </BlockStack>
      ) : (
        <Text tone="subdued" variant="bodySm">Keine Metafields vorhanden.</Text>
      )}
    </BlockStack>
  </Card>
);
}
