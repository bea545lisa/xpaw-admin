import { useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { useColorScheme } from "../context/ColorSchemeContext";
import { getMetafieldOrder, setMetafieldOrder } from "../services/settings.server";
import { SettingsIcon, EditIcon, DeleteIcon, XIcon } from "@shopify/polaris-icons";
import { Icon } from "@shopify/polaris";
import DeleteModal from "../components/shared/DeleteModal";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const defsRes = await admin.graphql(`
    query {
      metafieldDefinitions(ownerType: PRODUCT, first: 100) {
        edges { node { id name namespace key type { name } } }
      }
      shop {
        id
        metafield(namespace: "custom", key: "field_labels") { value }
      }
    }
  `);
  const defsJson = await defsRes.json();
  const definitions = defsJson.data?.metafieldDefinitions?.edges?.map(e => e.node) ?? [];
  const shopId = defsJson.data?.shop?.id;
  let fieldLabels = {};
  try { fieldLabels = JSON.parse(defsJson.data?.shop?.metafield?.value ?? "{}"); } catch { /* leer */ }

  const order = await getMetafieldOrder(session.shop);

  return { definitions, order, shopId, fieldLabels };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("action");

  if (type === "saveOrder") {
    const order = JSON.parse(formData.get("order") || "[]");
    await setMetafieldOrder(session.shop, order);
    return { ok: true, type: "saveOrder", order };
  }

  if (type === "saveFieldLabel") {
    const shopId = formData.get("shopId");
    const key = formData.get("key");
    const label = formData.get("label");

    // Aktuelle Labels lesen, den einen Key mergen, zurückschreiben (kein Read-Modify-Write-Race
    // erwartet, da nur ein Admin gleichzeitig an dieser Seite arbeitet)
    const currentRes = await admin.graphql(`
      query {
        shop { metafield(namespace: "custom", key: "field_labels") { value } }
      }
    `);
    const currentJson = await currentRes.json();
    let labels = {};
    try { labels = JSON.parse(currentJson.data?.shop?.metafield?.value ?? "{}"); } catch { /* leer */ }
    if (label.trim()) labels[key] = label.trim();
    else delete labels[key];

    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "custom",
          key: "field_labels",
          type: "json",
          value: JSON.stringify(labels),
        }],
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metafieldsSet?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "saveFieldLabel", key, label: label.trim(), userErrors };
  }

  if (type === "createDefinition") {
    const name = formData.get("name");
    const key = formData.get("key");
    const fieldType = formData.get("fieldType");

    let validations;

    // Liste (Bezeichnung/Wert): erst passenden Metaobjekt-Typ mit den beiden Feldern anlegen
    if (fieldType === "list.metaobject_reference") {
      const moRes = await admin.graphql(`
        mutation($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id type }
            userErrors { field message code }
          }
        }
      `, {
        variables: {
          definition: {
            type: key,
            name,
            fieldDefinitions: [
              { key: "bezeichnung", name: "Bezeichnung", type: "single_line_text_field", required: true },
              { key: "wert", name: "Wert", type: "single_line_text_field", required: true },
            ],
          },
        },
      });
      const moJson = await moRes.json();
      const moUserErrors = moJson.data?.metaobjectDefinitionCreate?.userErrors ?? [];
      if (moUserErrors.length > 0) {
        return { ok: false, type: "createDefinition", userErrors: moUserErrors };
      }
      const moDefId = moJson.data.metaobjectDefinitionCreate.metaobjectDefinition.id;
      validations = [{ name: "metaobject_definition_id", value: moDefId }];
    }

    const res = await admin.graphql(`
      mutation($definition: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $definition) {
          createdDefinition { id name namespace key type { name } }
          userErrors { field message code }
        }
      }
    `, {
      variables: {
        definition: {
          name,
          namespace: "custom",
          key,
          type: fieldType,
          ownerType: "PRODUCT",
          access: { storefront: "PUBLIC_READ" },
          ...(validations ? { validations } : {}),
        },
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metafieldDefinitionCreate?.userErrors ?? [];
    const definition = json.data?.metafieldDefinitionCreate?.createdDefinition ?? null;
    return { ok: userErrors.length === 0, type: "createDefinition", definition, userErrors };
  }

  if (type === "updateDefinition") {
    const key = formData.get("key");
    const name = formData.get("name");
    const res = await admin.graphql(`
      mutation($definition: MetafieldDefinitionUpdateInput!) {
        metafieldDefinitionUpdate(definition: $definition) {
          updatedDefinition { id name }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        definition: {
          namespace: formData.get("namespace"),
          key,
          ownerType: "PRODUCT",
          name,
        },
      },
    });
    const json = await res.json();
    const userErrors = json.data?.metafieldDefinitionUpdate?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "updateDefinition", key, name, userErrors };
  }

  if (type === "deleteDefinition") {
    const id = formData.get("id");
    const res = await admin.graphql(`
      mutation($id: ID!) {
        metafieldDefinitionDelete(id: $id, deleteAllAssociatedMetafields: false) {
          deletedDefinitionId
          userErrors { field message }
        }
      }
    `, { variables: { id } });
    const json = await res.json();
    const userErrors = json.data?.metafieldDefinitionDelete?.userErrors ?? [];
    return { ok: userErrors.length === 0, type: "deleteDefinition", id, userErrors };
  }

  return null;
};

function sortDefinitions(definitions, order) {
  const byKey = Object.fromEntries(definitions.map((d) => [d.key, d]));
  const kept = order.map((k) => byKey[k]).filter(Boolean);
  const missing = definitions.filter((d) => !order.includes(d.key));
  return [...kept, ...missing];
}

const DEF_TYPE_OPTIONS = [
  { label: "Single line text", value: "single_line_text_field" },
  { label: "Multi line text", value: "multi_line_text_field" },
  { label: "Integer", value: "number_integer" },
  { label: "Decimal", value: "number_decimal" },
  { label: "Boolean", value: "boolean" },
  { label: "Date", value: "date" },
  { label: "URL", value: "url" },
  { label: "JSON", value: "json" },
  { label: "Liste (Bezeichnung/Wert)", value: "list.metaobject_reference" },
];

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export default function MetafieldsPage() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { definitions: initialDefinitions, order: initialOrder, shopId, fieldLabels: initialFieldLabels } = useLoaderData();
  const fetcher = useFetcher();
  const labelFetcher = useFetcher();

  const [localDefinitions, setLocalDefinitions] = useState(initialDefinitions);
  const [orderedKeys, setOrderedKeys] = useState(() => {
    const kept = initialOrder.filter((k) => initialDefinitions.some((d) => d.key === k));
    const missing = initialDefinitions.filter((d) => !kept.includes(d.key)).map((d) => d.key);
    return [...kept, ...missing];
  });
  const [dragKey, setDragKey] = useState(null);
  const [toast, setToast] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [fieldLabels, setFieldLabels] = useState(initialFieldLabels);
  const [labelDrafts, setLabelDrafts] = useState({});

  // Neue Definition anlegen
  const [showNewDef, setShowNewDef] = useState(false);
  const [newDef, setNewDef] = useState({ name: "", type: "single_line_text_field" });
  const nameInputRef = useRef(null);

  const orderedDefinitions = sortDefinitions(localDefinitions, orderedKeys);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (showNewDef) nameInputRef.current?.focus();
  }, [showNewDef]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data;

    if (d.type === "createDefinition") {
      if (!d.ok || !d.definition) { setToast(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
      setLocalDefinitions((prev) => [...prev, d.definition]);
      setOrderedKeys((prev) => [...prev, d.definition.key]);
      setToast("Definition erstellt");
      setShowNewDef(false);
      setNewDef({ name: "", type: "single_line_text_field" });
    }

    if (d.type === "updateDefinition") {
      if (!d.ok) { setToast(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
      setLocalDefinitions((prev) => prev.map((def) => def.key === d.key ? { ...def, name: d.name } : def));
      setToast("Name gespeichert");
      setEditingKey(null);
    }

    if (d.type === "deleteDefinition") {
      if (!d.ok) { setToast(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
      setLocalDefinitions((prev) => prev.filter((def) => def.id !== d.id));
      setOrderedKeys((prev) => prev.filter((k) => localDefinitions.find((def) => def.id === d.id)?.key !== k));
      setToast("Definition gelöscht");
      setDeleteTarget(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (labelFetcher.state !== "idle" || !labelFetcher.data) return;
    const d = labelFetcher.data;
    if (d.type !== "saveFieldLabel") return;
    if (!d.ok) { setToast(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
    setFieldLabels((prev) => {
      const next = { ...prev };
      if (d.label) next[d.key] = d.label; else delete next[d.key];
      return next;
    });
    setToast("Shop-Label gespeichert");
  }, [labelFetcher.state, labelFetcher.data]);

  const saveLabel = (key) => {
    const value = labelDrafts[key] ?? fieldLabels[key] ?? "";
    labelFetcher.submit(
      { action: "saveFieldLabel", shopId, key, label: value },
      { method: "POST" }
    );
  };

  const openEdit = (def) => {
    setEditingKey(def.key);
    setEditName(def.name);
  };

  const saveEdit = (def) => {
    if (!editName.trim()) return;
    fetcher.submit(
      { action: "updateDefinition", namespace: def.namespace, key: def.key, name: editName.trim() },
      { method: "POST" }
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    fetcher.submit({ action: "deleteDefinition", id: deleteTarget.id }, { method: "POST" });
  };

  const submitCreateDefinition = () => {
    if (!newDef.name.trim()) return;
    const key = slugify(newDef.name);
    if (!key || localDefinitions.some((d) => d.key === key)) {
      setToast("Ungültiger oder bereits vergebener Key");
      return;
    }
    fetcher.submit(
      { action: "createDefinition", name: newDef.name.trim(), key, fieldType: newDef.type },
      { method: "POST" }
    );
  };

  const persistOrder = (keys) => {
    fetcher.submit(
      { action: "saveOrder", order: JSON.stringify(keys) },
      { method: "POST" }
    );
    setToast("Standard-Reihenfolge gespeichert");
  };

  const handleDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const next = [...orderedKeys];
    const fromIndex = next.indexOf(dragKey);
    const toIndex = next.indexOf(targetKey);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragKey);
    setOrderedKeys(next);
    persistOrder(next);
    setDragKey(null);
  };

  return (
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ display: "flex", fill: isDark ? "#f3f4f6" : "#555" }}><SettingsIcon width={24} height={24} /></span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Metafields</h1>
        <span style={{ fontSize: 13, color: "#888", marginLeft: 4 }}>{localDefinitions.length} Definitionen</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { setShowNewDef((v) => !v); setNewDef({ name: "", type: "single_line_text_field" }); }}
          style={saveBtnStyle()}
        >
          {showNewDef ? "Abbrechen" : "+ Neu"}
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#888", marginBottom: 12 }}>
        Store-weite Standard-Reihenfolge für Produkt-Metafields — greift auf allen Produkten,
        die keine eigene Reihenfolge festgelegt haben. Zum Ändern der Reihenfolge Zeilen per
        Drag &amp; Drop verschieben.
      </p>

      <div style={{
        fontSize: 12, color: isDark ? "#9ec5fe" : "#0958d9",
        background: isDark ? "#0d2a4a" : "#e6f4ff",
        border: `1px solid ${isDark ? "#1f4a75" : "#91caff"}`, borderRadius: 6,
        padding: "8px 10px", marginBottom: 20,
      }}>
        ℹ️ Übersetzte Labels im Shop-Frontend funktionieren nicht automatisch (Liquid kann den
        Definitionsnamen nicht auslesen). Dafür in <code>rexpaw-storefront/sections/main-product.liquid</code> im{" "}
        <code>custom_metafields</code>-Block einen <code>{"{% when 'dein_key' %}"}</code>-Zweig ergänzen und die
        Übersetzung in <code>locales/de.json</code> / <code>locales/en.default.json</code> unter{" "}
        <code>products.product.custom_metafields.dein_key</code> eintragen.
      </div>

      {showNewDef && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
          padding: 12, borderRadius: 8,
          border: `1px dashed ${isDark ? "#4a4a4a" : "#ddd"}`,
          background: isDark ? "#1a1a1a" : "#fff",
        }}>
          <input
            ref={nameInputRef}
            placeholder="Name, z.B. Material"
            value={newDef.name}
            onChange={(e) => setNewDef((f) => ({ ...f, name: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && submitCreateDefinition()}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 6, fontSize: 14,
              border: `1px solid ${isDark ? "#4a4a4a" : "#ddd"}`,
              background: isDark ? "#2c2c2c" : "#fff", color: isDark ? "#e5e7eb" : "#111",
            }}
          />
          <select
            value={newDef.type}
            onChange={(e) => setNewDef((f) => ({ ...f, type: e.target.value }))}
            style={{
              padding: "7px 10px", borderRadius: 6, fontSize: 14,
              border: `1px solid ${isDark ? "#4a4a4a" : "#ddd"}`,
              background: isDark ? "#2c2c2c" : "#fff", color: isDark ? "#e5e7eb" : "#111",
            }}
          >
            {DEF_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={submitCreateDefinition} style={saveBtnStyle()} disabled={!newDef.name.trim()}>
            Anlegen
          </button>
        </div>
      )}

      <div style={{ background: isDark ? "#1a1a1a" : "#fff", borderRadius: 12, border: `1px solid ${isDark ? "#444" : "#e3e3e3"}`, overflow: "hidden" }}>
        {orderedDefinitions.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Keine Metafield-Definitionen gefunden</div>
        ) : (
          orderedDefinitions.map((def, i) => (
            <div
              key={def.id}
              draggable
              onDragStart={() => setDragKey(def.key)}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleDrop(def.key); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 16px",
                borderBottom: i < orderedDefinitions.length - 1 ? `1px solid ${isDark ? "#3a3a3a" : "#f0f0f0"}` : "none",
                background: isDark ? "#1a1a1a" : "#fff",
                opacity: dragKey === def.key ? 0.5 : 1,
              }}
            >
              <span style={{ cursor: "grab", color: "var(--p-color-text-subdued)", userSelect: "none" }} title="Ziehen zum Sortieren">⠿</span>

              {editingKey === def.key ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(def)}
                    style={{
                      flex: 1, padding: "6px 10px", borderRadius: 6, fontSize: 14,
                      border: `1px solid ${isDark ? "#4a4a4a" : "#ddd"}`,
                      background: isDark ? "#2c2c2c" : "#fff", color: isDark ? "#e5e7eb" : "#111",
                    }}
                  />
                  <button onClick={() => saveEdit(def)} style={saveBtnStyle()}>Speichern</button>
                  <button onClick={() => setEditingKey(null)} style={iconBtnStyle(isDark)} title="Abbrechen">
                    <Icon source={XIcon} tone="subdued" />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{def.name}</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>{def.namespace}.{def.key} · {def.type.name}</div>
                  </div>
                  <button onClick={() => openEdit(def)} style={iconBtnStyle(isDark)} title="Umbenennen">
                    <Icon source={EditIcon} tone="subdued" />
                  </button>
                  <button onClick={() => setDeleteTarget(def)} style={iconBtnStyle(isDark, true)} title="Löschen">
                    <Icon source={DeleteIcon} tone="critical" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget?.name}
        onClose={() => setDeleteTarget(null)}
        onDelete={confirmDelete}
        isDeleting={fetcher.state !== "idle"}
      />

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "calc(220px + (100vw - 220px) / 2)", transform: "translateX(-50%)",
          background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, zIndex: 9999, whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const iconBtnStyle = (isDark, danger) => ({
  border: "none", background: "transparent", cursor: "pointer", padding: 0, borderRadius: 6,
  color: danger ? "#e57373" : (isDark ? "#c4c7cc" : "#555"),
  width: 28, height: 28,
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
});

const saveBtnStyle = () => ({
  padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 500,
  cursor: "pointer", background: "#303030", color: "#fff", flexShrink: 0,
});
