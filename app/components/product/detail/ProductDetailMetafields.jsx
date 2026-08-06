import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField, Icon, Tag, Modal } from "@shopify/polaris";
import { EditIcon, XIcon, DeleteIcon } from "@shopify/polaris-icons";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";

const METAOBJECT_REFERENCE_LIST = "list.metaobject_reference";

// Zeigt die Felder eines referenzierten Metaobjects als "key: value" zusammengefasst
function summarizeMetaobjectFields(fields) {
  if (!fields?.length) return "—";
  return fields.map((f) => `${f.key}: ${f.value}`).join(" · ")
}

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

const EMPTY_NEW = { name: "", key: "", type: "single_line_text_field", value: "" };

// Editor für list.metaobject_reference-Metafields: zeigt referenzierte
// Metaobjects als Bezeichnung/Wert-Paare, erlaubt Hinzufügen/Entfernen
function MetaobjectReferenceField({ field, productId, onChange, onDelete, setToast }) {
  const searchFetcher = useFetcher();
  const updateFetcher = useFetcher();
  const [showAdd, setShowAdd] = useState(false);
  const addRef = useRef(null);

  const references = field.references?.edges?.map((e) => e.node) ?? [];
  const metaobjectType = references[0]?.type ?? null;

  useEffect(() => {
    if (showAdd && metaobjectType && searchFetcher.state === "idle" && !searchFetcher.data) {
      searchFetcher.submit(
        { action: "searchMetaobjects", metaobjectType },
        { method: "POST" }
      );
    }
  }, [showAdd, metaobjectType]);

  useEffect(() => {
    if (!showAdd) return;
    const onClickOutside = (e) => {
      if (addRef.current && !addRef.current.contains(e.target)) setShowAdd(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showAdd]);

  const availableMetaobjects = (searchFetcher.data?.metaobjects ?? []).filter(
    (mo) => !references.some((r) => r.id === mo.id)
  );

  const saveReferences = (nextReferences) => {
    updateFetcher.submit(
      {
        action: "updateMetafield",
        metafieldId: field.id,
        productId,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: JSON.stringify(nextReferences.map((r) => r.id)),
      },
      { method: "POST" }
    );
    onChange(nextReferences);
  };

  const handleRemove = (refId) => {
    saveReferences(references.filter((r) => r.id !== refId));
    setToast?.("Verknüpfung entfernt");
  };

  const handleAdd = (metaobject) => {
    saveReferences([...references, metaobject]);
    setShowAdd(false);
    setToast?.("Verknüpfung hinzugefügt");
  };

  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--p-color-border-subdued)" }}>
      <BlockStack gap="150">
        <InlineStack align="space-between" blockAlign="center">
          <Text variant="bodySm" fontWeight="semibold">{field.key}</Text>
          <InlineStack gap="150" blockAlign="center">
            <div style={{ position: "relative" }} ref={addRef}>
              <Button size="micro" onClick={() => setShowAdd((v) => !v)} disabled={!metaobjectType && references.length === 0}>
                + Hinzufügen
              </Button>
              <PositionedDropdown anchorRef={addRef} open={showAdd}>
                {searchFetcher.state !== "idle" && (
                  <div style={{ padding: "8px 12px", fontSize: 13 }}>Lade…</div>
                )}
                {searchFetcher.state === "idle" && availableMetaobjects.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 13 }}>Keine weiteren Einträge</div>
                )}
                {availableMetaobjects.map((mo) => (
                  <div
                    key={mo.id}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--p-color-border-subdued)" }}
                    onMouseDown={(e) => { e.preventDefault(); handleAdd(mo); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    {summarizeMetaobjectFields(mo.fields)}
                  </div>
                ))}
              </PositionedDropdown>
            </div>
            <button
              onClick={() => onDelete(field)}
              style={{
                background: "transparent",
                border: "1px solid var(--p-color-border)",
                borderRadius: 4, cursor: "pointer",
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                flexShrink: 0,
              }}
            >
              <Icon source={DeleteIcon} tone="critical" />
            </button>
          </InlineStack>
        </InlineStack>

        {references.length === 0 ? (
          <Text variant="bodySm" tone="subdued">Keine Verknüpfungen</Text>
        ) : (
          <InlineStack gap="150" wrap>
            {references.map((ref) => (
              <Tag key={ref.id} onRemove={() => handleRemove(ref.id)}>
                {summarizeMetaobjectFields(ref.fields)}
              </Tag>
            ))}
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );
}

export default function ProductDetailMetafields({ metafields, productId, fetcher, setToast }) {

  const [localMetafields, setLocalMetafields] = useState(metafields);
  const [editingId, setEditingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newField, setNewField] = useState(EMPTY_NEW);
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const keyRef = useRef(null);
  const valueRef = useRef(null);
  const typeRef = useRef(null);

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
    setDrafts((prev) => ({
      ...prev,
      [field.id]: { value: field.value ?? "", name: field.definition?.name ?? "" },
    }));
  };

  const handleSave = (field) => {
    const draft = drafts[field.id] ?? {};
    fetcher.submit(
      {
        action: "updateMetafield",
        metafieldId: field.id,
        productId,
        namespace: field.namespace,
        key: field.key,
        type: field.type,
        value: draft.value ?? "",
        name: draft.name ?? "",
        definitionId: field.definition?.id ?? "",
      },
      { method: "POST" }
    );
    setEditingId(null);
    setToast?.("Metafield gespeichert");
  };

  const handleCreate = () => {
    if (!newField.key.trim()) return;
    fetcher.submit(
      { action: "createMetafield", productId, namespace: "custom", name: newField.name || newField.key, key: newField.key, type: newField.type, value: newField.value },
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
          ? {
              ...f,
              value: fetcher.data.value,
              definition: fetcher.data.name
                ? { ...f.definition, name: fetcher.data.name }
                : f.definition,
            }
          : f
      ));
    }

    if (fetcher.data.type === "createMetafield" && fetcher.data.metafield) {
      setLocalMetafields(prev => [...prev, fetcher.data.metafield]);
    }

    if (fetcher.data.type === "deleteMetafield") {
      setLocalMetafields(prev => prev.filter(f => f.id !== fetcher.data.metafieldId));
    }
  }, [fetcher.state, fetcher.data]);

  const requestDelete = (field) => setDeleteTarget(field);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    fetcher.submit(
      { action: "deleteMetafield", metafieldId: deleteTarget.id, productId, namespace: deleteTarget.namespace, key: deleteTarget.key },
      { method: "POST" }
    );
    setToast?.("Metafield gelöscht");
    setDeleteTarget(null);
  };

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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
              <TextField
                label="Name"
                value={newField.name}
                onChange={(val) => setNewField((f) => ({ ...f, name: val }))}
                autoComplete="off"
                placeholder="z.B. Material (Anzeigename im Shop)"
                helpText="Wird im Shop als Beschriftung angezeigt"
              />

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

              <div style={{ position: "relative" }}>
                <div ref={typeRef}>
                  <TextField
                    label="Typ"
                    value={TYPE_OPTIONS.find((o) => o.value === newField.type)?.label ?? ""}
                    readOnly
                    onFocus={() => setShowTypeDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTypeDropdown(false), 150)}
                    autoComplete="off"
                  />
                </div>
                <PositionedDropdown anchorRef={typeRef} open={showTypeDropdown}>
                  {TYPE_OPTIONS.map((o) => (
                    <div key={o.value} style={dropdownItem}
                      onMouseDown={(e) => { e.preventDefault(); setNewField((f) => ({ ...f, type: o.value })); setShowTypeDropdown(false); }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{o.label}</div>
                  ))}
                </PositionedDropdown>
              </div>

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
            if (field.type === METAOBJECT_REFERENCE_LIST) {
              return (
                <MetaobjectReferenceField
                  key={field.id}
                  field={field}
                  productId={productId}
                  setToast={setToast}
                  onDelete={requestDelete}
                  onChange={(nextReferences) => {
                    setLocalMetafields((prev) => prev.map((f) =>
                      f.id === field.id
                        ? {
                            ...f,
                            value: JSON.stringify(nextReferences.map((r) => r.id)),
                            references: { edges: nextReferences.map((r) => ({ node: r })) },
                          }
                        : f
                    ));
                  }}
                />
              );
            }
            const isEditing = editingId === field.id;
            return (
              <div key={field.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--p-color-border-subdued)" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="300" blockAlign="center">
                    <div style={{ minWidth: 100 }}>
                      <Text variant="bodySm" fontWeight="semibold">{field.definition?.name || field.key}</Text>
                      {field.definition?.name && field.definition.name !== field.key && (
                        <Text variant="bodyXs" tone="subdued">{field.key}</Text>
                      )}
                    </div>
                    {!isEditing && (
                      <Text variant="bodySm" tone="subdued">{field.value || "—"}</Text>
                    )}
                    {isEditing && (
                      <InlineStack gap="200" blockAlign="center">
                        <div style={{ width: 160 }}>
                          <TextField
                            label="" labelHidden
                            placeholder="Name"
                            value={drafts[field.id]?.name ?? ""}
                            onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: { ...prev[field.id], name: val } }))}
                            autoComplete="off"
                          />
                        </div>
                        <div style={{ width: 200 }}>
                          <TextField
                            label="" labelHidden
                            placeholder="Wert"
                            value={drafts[field.id]?.value ?? ""}
                            onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: { ...prev[field.id], value: val } }))}
                            multiline={isMultiline(field.type) ? 3 : undefined}
                            autoComplete="off"
                          />
                        </div>
                        <Button size="slim" onClick={() => setEditingId(null)}>Abbrechen</Button>
                        <Button variant="primary" size="slim" onClick={() => handleSave(field)}>Speichern</Button>
                      </InlineStack>
                    )}
                  </InlineStack>
                  <InlineStack gap="150" blockAlign="center">
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
                    <button
                      onClick={() => requestDelete(field)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--p-color-border)",
                        borderRadius: 4, cursor: "pointer",
                        width: 28, height: 28,
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <Icon source={DeleteIcon} tone="critical" />
                    </button>
                  </InlineStack>
                </InlineStack>
              </div>
            );
          })}
        </BlockStack>
      ) : (
        <Text tone="subdued" variant="bodySm">Keine Metafields vorhanden.</Text>
      )}
    </BlockStack>

    <Modal
      open={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      title="Metafield löschen"
      primaryAction={{ content: "Löschen", destructive: true, onAction: confirmDelete }}
      secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteTarget(null) }]}
    >
      <Modal.Section>
        <Text>Metafield <strong>{deleteTarget?.key}</strong> wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.</Text>
      </Modal.Section>
    </Modal>
  </Card>
);
}
