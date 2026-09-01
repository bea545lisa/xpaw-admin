import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { BlockStack, Text, Button, InlineStack, Divider, TextField, Icon, Modal, Tooltip, Link } from "@shopify/polaris";
import { EditIcon, XIcon, DeleteIcon, GlobeIcon, InfoIcon } from "@shopify/polaris-icons";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";
import LocaleFlag from "../../shared/LocaleFlag.jsx";
import { useConfiguratorUpload } from "../../../hooks/useConfiguratorUpload.jsx";

function keyDerivedLabel(key) {
  return String(key ?? "").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

// Faengt den haeufigen Tippfehler ab, den Namespace ("custom.") mit ins Key-Feld
// zu schreiben - Namespace ist im Formular ein separates, festes Feld (immer
// "custom"), sodass ein mitgetippter Punkt sonst woertlich Teil des Keys wird
// (z.B. "custom.canvas_layers" statt "canvas_layers") und die Metafield-
// Definition spaeter mit "Key enthaelt ungueltige Zeichen" scheitert.
function stripNamespacePrefix(key) {
  return key.includes(".") ? key.slice(key.lastIndexOf(".") + 1) : key;
}

const METAOBJECT_REFERENCE_LIST = "list.metaobject_reference";
// "eigenschaften" ist immer an den Metaobjekt-Typ "produktmerkmal" gebunden (siehe Metafield-
// Definition in Shopify). Wird als Fallback gebraucht, solange noch keine Verknüpfung existiert
// und der Typ sich nicht aus references[0] ableiten lässt.
const EIGENSCHAFTEN_METAOBJECT_TYPE = "produktmerkmal";

// Nur diese Metafield-Typen sind bei Shopify übersetzbar
const TRANSLATABLE_TYPES = ["single_line_text_field", "multi_line_text_field", "json"];

// Zerlegt ein referenziertes Metaobject in Label/Wert (Bezeichnung/Wert-Paar wie bei "eigenschaften")
function splitMetaobjectFields(fields) {
  if (!fields?.length) return { label: "", value: "—" };
  const bezeichnung = fields.find((f) => f.key === "bezeichnung")?.value;
  const wert = fields.find((f) => f.key === "wert")?.value;
  if (bezeichnung && wert) return { label: bezeichnung, value: wert };
  return { label: "", value: fields.map((f) => f.value).join(" · ") };
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

// Verstecktes Metafield, das die produktspezifische Reihenfolge speichert (überschreibt
// den store-weiten Default). Shopify-Metafields haben von sich aus keine Reihenfolge.
const ORDER_NAMESPACE = "rexpaw";
const ORDER_KEY = "metafields_order";
// Weitere interne Felder, die nie in der Liste angezeigt werden sollen
const HIDDEN_KEYS = [ORDER_KEY, "option_abbreviations"];

function computeInitialOrder(fields, defaultOrder = []) {
  const orderField = fields.find((f) => f.namespace === ORDER_NAMESPACE && f.key === ORDER_KEY);
  let saved = defaultOrder ?? [];
  if (orderField) {
    try { saved = JSON.parse(orderField.value); } catch { /* fällt auf defaultOrder zurück */ }
  }
  const visibleKeys = fields.filter((f) => !HIDDEN_KEYS.includes(f.key)).map((f) => f.key);
  const kept = saved.filter((k) => visibleKeys.includes(k));
  const missing = visibleKeys.filter((k) => !kept.includes(k));
  return [...kept, ...missing];
}

// Editor für list.metaobject_reference-Metafields: zeigt referenzierte
// Metaobjects als Bezeichnung/Wert-Paare, erlaubt Hinzufügen/Entfernen
function MetaobjectReferenceField({
  field, productId, locales = [], onChange, onDelete, setToast, dragHandle, editingRefId, setEditingRefId, closeOtherEditors,
  shopId, metaobjectTypeByFieldKey = {}, fieldLabels, labelDrafts, setLabelDrafts, saveFieldLabel, labelDraftKey,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const searchFetcher = useFetcher();
  const updateFetcher = useFetcher();
  const metaobjectFetcher = useFetcher();
  const translationFetcher = useFetcher();
  const saveTranslationFetcher = useFetcher();
  const autoTranslateFetcher = useFetcher();
  const [autoTranslatingKey, setAutoTranslatingKey] = useState(null); // `${refId}:${locale}`
  const [editingFieldLabel, setEditingFieldLabel] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showBezeichnungDropdown, setShowBezeichnungDropdown] = useState(false);
  const [showWertDropdown, setShowWertDropdown] = useState(false);
  const [newDraft, setNewDraft] = useState({ bezeichnung: "", wert: "" });
  const [editDraft, setEditDraft] = useState({ bezeichnung: "", wert: "" });
  // { [refId]: { translatableContent: [...], translations: { locale: [...] } } }
  const [translationData, setTranslationData] = useState({});
  const [translationDrafts, setTranslationDrafts] = useState({});
  const bezeichnungRef = useRef(null);
  const wertRef = useRef(null);

  const primaryLocale = locales.find((l) => l.primary)?.locale;

  const references = field.references?.edges?.map((e) => e.node) ?? [];
  const metaobjectType = references[0]?.type
    ?? metaobjectTypeByFieldKey?.[field.key]
    ?? (field.key === "eigenschaften" ? EIGENSCHAFTEN_METAOBJECT_TYPE : null);

  useEffect(() => {
    if (showNewForm && metaobjectType && searchFetcher.state === "idle" && !searchFetcher.data) {
      searchFetcher.submit(
        { action: "searchMetaobjects", metaobjectType },
        { method: "POST" }
      );
    }
  }, [showNewForm, metaobjectType]);

  // Vorhandene Bezeichnungen (z.B. "Material", "Herkunft") für Autocomplete, ohne die Werte
  const existingBezeichnungen = [...new Set(
    (searchFetcher.data?.metaobjects ?? [])
      .map((mo) => mo.fields.find((f) => f.key === "bezeichnung")?.value)
      .filter(Boolean)
  )];
  const filteredBezeichnungen = existingBezeichnungen.filter((b) =>
    b.toLowerCase().includes(newDraft.bezeichnung.toLowerCase())
  );

  // Vorhandene Werte zur gewählten Bezeichnung (z.B. bei "Herkunft": "Portugal", "China")
  // — zeigt beim Anlegen, ob es den Wert bei anderen Produkten schon gibt (Dopplungen vermeiden)
  const existingValuesForBezeichnung = [...new Set(
    (searchFetcher.data?.metaobjects ?? [])
      .filter((mo) => mo.fields.find((f) => f.key === "bezeichnung")?.value?.toLowerCase() === newDraft.bezeichnung.trim().toLowerCase())
      .map((mo) => mo.fields.find((f) => f.key === "wert")?.value)
      .filter(Boolean)
  )];
  const filteredWerte = existingValuesForBezeichnung.filter((w) =>
    w.toLowerCase().includes(newDraft.wert.toLowerCase())
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

  useEffect(() => {
    if (metaobjectFetcher.state !== "idle" || metaobjectFetcher.data?.type !== "createMetaobject") return;
    if (metaobjectFetcher.data.ok === false) {
      setToast?.(`Fehler: ${metaobjectFetcher.data.error || "Eintrag konnte nicht angelegt werden"}`);
      return;
    }
    const created = metaobjectFetcher.data.metaobject;
    if (created) {
      saveReferences([...references, created]);
      setToast?.("Eintrag angelegt");
    }
    setShowNewForm(false);
    setNewDraft({ bezeichnung: "", wert: "" });
  }, [metaobjectFetcher.state, metaobjectFetcher.data]);

  const handleCreateNew = () => {
    if (!newDraft.bezeichnung.trim() || !metaobjectType) return;

    // Existiert bereits ein Eintrag mit exakt derselben Bezeichnung + Wert
    // (z.B. wiederverwendet von einem anderen Produkt)? Dann verlinken statt duplizieren.
    const existing = (searchFetcher.data?.metaobjects ?? []).find((mo) => {
      const b = mo.fields.find((f) => f.key === "bezeichnung")?.value?.trim().toLowerCase();
      const w = mo.fields.find((f) => f.key === "wert")?.value?.trim().toLowerCase();
      return b === newDraft.bezeichnung.trim().toLowerCase() && w === newDraft.wert.trim().toLowerCase();
    });

    if (existing) {
      saveReferences([...references, existing]);
      setShowNewForm(false);
      setNewDraft({ bezeichnung: "", wert: "" });
      setToast?.("Bestehender Eintrag verknüpft");
      return;
    }

    metaobjectFetcher.submit(
      {
        action: "createMetaobject",
        metaobjectType,
        fields: JSON.stringify([
          { key: "bezeichnung", value: newDraft.bezeichnung },
          { key: "wert", value: newDraft.wert },
        ]),
      },
      { method: "POST" }
    );
  };

  const openEditRef = (ref) => {
    closeOtherEditors?.();
    setEditingRefId(ref.id);
    setEditDraft({
      bezeichnung: ref.fields.find((f) => f.key === "bezeichnung")?.value ?? "",
      wert: ref.fields.find((f) => f.key === "wert")?.value ?? "",
    });
    if (locales.length > 0 && !translationData[ref.id]) {
      translationFetcher.submit(
        { action: "getMetaobjectTranslations", metaobjectId: ref.id, locales: JSON.stringify(locales.map((l) => l.locale)) },
        { method: "POST" }
      );
    }
  };

  useEffect(() => {
    if (translationFetcher.state !== "idle" || translationFetcher.data?.type !== "getMetaobjectTranslations") return;
    const d = translationFetcher.data;
    setTranslationData((prev) => ({
      ...prev,
      [d.metaobjectId]: { translatableContent: d.translatableContent, translations: d.translations },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationFetcher.state, translationFetcher.data]);

  useEffect(() => {
    if (saveTranslationFetcher.state !== "idle" || saveTranslationFetcher.data?.type !== "saveMetaobjectTranslation") return;
    const d = saveTranslationFetcher.data;
    if (!d.ok) { setToast?.(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
    setTranslationData((prev) => {
      const entry = prev[d.metaobjectId];
      if (!entry) return prev;
      const nextTranslations = { ...entry.translations };
      const list = (nextTranslations[d.locale] ?? []).filter((t) => t.key !== d.key);
      if (d.value) list.push({ key: d.key, value: d.value, locale: d.locale });
      nextTranslations[d.locale] = list;
      return { ...prev, [d.metaobjectId]: { ...entry, translations: nextTranslations } };
    });
    setToast?.("Übersetzung gespeichert");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveTranslationFetcher.state, saveTranslationFetcher.data]);

  useEffect(() => {
    if (autoTranslateFetcher.state !== "idle" || autoTranslateFetcher.data?.type !== "autoTranslateMetaobject") return;
    const d = autoTranslateFetcher.data;
    setAutoTranslatingKey(null);
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    setTranslationData((prev) => {
      const entry = prev[d.metaobjectId];
      if (!entry) return prev;
      return { ...prev, [d.metaobjectId]: { ...entry, translations: { ...entry.translations, [d.locale]: d.translations } } };
    });
    setTranslationDrafts((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.startsWith(`${d.metaobjectId}:${d.locale}:`)) delete next[k];
      }
      return next;
    });
    setToast?.("Automatisch übersetzt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslateFetcher.state, autoTranslateFetcher.data]);

  const handleAutoTranslate = (ref, locale) => {
    setAutoTranslatingKey(`${ref.id}:${locale}`);
    autoTranslateFetcher.submit(
      { action: "autoTranslateMetaobject", metaobjectId: ref.id, locale, sourceLocale: primaryLocale },
      { method: "POST" }
    );
  };

  const translationDraftKey = (refId, locale, key) => `${refId}:${locale}:${key}`;

  const saveTranslation = (ref, locale, key) => {
    const entry = translationData[ref.id];
    const content = entry?.translatableContent?.find((c) => c.key === key);
    if (!content) return;
    const dk = translationDraftKey(ref.id, locale, key);
    const existing = entry.translations?.[locale]?.find((t) => t.key === key)?.value ?? "";
    const value = translationDrafts[dk] ?? existing;
    saveTranslationFetcher.submit(
      { action: "saveMetaobjectTranslation", metaobjectId: ref.id, locale, key, value, digest: content.digest },
      { method: "POST" }
    );
  };

  const saveEditRef = (ref) => {
    metaobjectFetcher.submit(
      {
        action: "updateMetaobject",
        metaobjectId: ref.id,
        fields: JSON.stringify([
          { key: "bezeichnung", value: editDraft.bezeichnung },
          { key: "wert", value: editDraft.wert },
        ]),
      },
      { method: "POST" }
    );
    onChange(references.map((r) => r.id === ref.id
      ? { ...r, fields: [{ key: "bezeichnung", value: editDraft.bezeichnung }, { key: "wert", value: editDraft.wert }] }
      : r
    ));
    setEditingRefId(null);
    setToast?.("Eintrag gespeichert");
  };

  const pill = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 10px", borderRadius: 999,
    border: isDark ? "1px solid rgba(255,255,255,0.28)" : "1px solid var(--p-color-border)",
    background: isDark ? "rgba(255,255,255,0.08)" : "var(--p-color-bg-surface-secondary)",
    fontSize: 12, lineHeight: 1,
  };
  const removeBtn = {
    border: "none", background: "transparent",
    cursor: "pointer", padding: 0,
    color: "var(--p-color-text-subdued)",
  };

  return (
    <div style={{ padding: "3px 0", borderBottom: "1px solid var(--p-color-border-subdued)" }}>
      <BlockStack gap="150">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="100" blockAlign="center">
            {dragHandle}
            <Text variant="bodySm" fontWeight="semibold">{field.definition?.name || field.key}</Text>
          </InlineStack>
          <InlineStack gap="150" blockAlign="center" wrap={false}>
            <button
              onClick={() => setEditingFieldLabel((v) => !v)}
              style={{
                background: "transparent",
                border: "1px solid var(--p-color-border)",
                borderRadius: 4, cursor: "pointer",
                width: 28, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                flexShrink: 0,
              }}
              title="Feldname bearbeiten & übersetzen"
            >
              <span style={{ display: "flex", transform: editingFieldLabel ? "scale(1.2)" : "none" }}>
                <Icon source={editingFieldLabel ? XIcon : EditIcon} tone="subdued" />
              </span>
            </button>
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

        {editingFieldLabel && (
          <div style={{
            display: "flex", flexDirection: "column", gap: 8,
            padding: 10, borderRadius: 8,
            border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
            background: isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)",
          }}>
            {locales.map((loc) => {
              const dk = labelDraftKey(field.key, loc.locale);
              const value = labelDrafts[dk] ?? fieldLabels[loc.locale]?.[field.key] ?? "";
              return (
                <InlineStack key={loc.locale} gap="100" blockAlign="center" wrap={false}>
                  <span style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                    <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
                  </span>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="" labelHidden autoComplete="off"
                      placeholder={keyDerivedLabel(field.key)}
                      value={value}
                      onChange={(val) => setLabelDrafts((prev) => ({ ...prev, [dk]: val }))}
                      onBlur={() => saveFieldLabel(field, loc.locale)}
                    />
                  </div>
                </InlineStack>
              );
            })}
            <InlineStack align="end">
              <Button size="slim" onClick={() => setEditingFieldLabel(false)}>Fertig</Button>
            </InlineStack>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", paddingLeft: 16 }}>
          {references.map((ref) => {
            if (editingRefId === ref.id) {
              const translationLocales = locales.filter((l) => !l.primary);
              const entry = translationData[ref.id];
              return (
                <div key={ref.id} style={{
                  width: "100%", padding: 10, borderRadius: 8,
                  border: `1px dashed ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                }}>
                  <BlockStack gap="100">
                    <InlineStack gap="100" blockAlign="end" wrap={false}>
                      {primaryLocale && (
                        <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", marginRight: 6, paddingBottom: 8 }}>
                          <LocaleFlag locale={primaryLocale} size={20} round />
                        </div>
                      )}
                      <div style={{ width: 130 }}>
                        <Text variant="bodyXs" tone="subdued" as="p">Bezeichnung</Text>
                        <div style={{ marginTop: 6 }}>
                          <TextField
                            label="Bezeichnung"
                            labelHidden
                            value={editDraft.bezeichnung}
                            onChange={(val) => setEditDraft((d) => ({ ...d, bezeichnung: val }))}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                      <div style={{ width: 150 }}>
                        <Text variant="bodyXs" tone="subdued" as="p">Wert</Text>
                        <div style={{ marginTop: 6 }}>
                          <TextField
                            label="Wert"
                            labelHidden
                            value={editDraft.wert}
                            onChange={(val) => setEditDraft((d) => ({ ...d, wert: val }))}
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    </InlineStack>

                    {translationLocales.length > 0 && (
                      <BlockStack gap="100">
                        {!entry ? (
                          <Text variant="bodyXs" tone="subdued">Lade…</Text>
                        ) : (
                          translationLocales.map((loc) => {
                            const autoKey = `${ref.id}:${loc.locale}`;
                            return (
                            <InlineStack key={loc.locale} gap="100" blockAlign="center" wrap={false}>
                              <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", marginRight: 6 }}>
                                <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
                              </span>
                              {["bezeichnung", "wert"].map((k, i) => {
                                const dk = translationDraftKey(ref.id, loc.locale, k);
                                const existing = entry.translations?.[loc.locale]?.find((t) => t.key === k)?.value ?? "";
                                return (
                                  <div key={k} style={{ width: i === 0 ? 130 : 150 }}>
                                    <TextField
                                      label=""
                                      labelHidden
                                      placeholder={(k === "bezeichnung" ? editDraft.bezeichnung : editDraft.wert) || (k === "bezeichnung" ? "Bezeichnung" : "Wert")}
                                      value={translationDrafts[dk] ?? existing}
                                      onChange={(val) => setTranslationDrafts((prev) => ({ ...prev, [dk]: val }))}
                                      onBlur={() => saveTranslation(ref, loc.locale, k)}
                                      autoComplete="off"
                                    />
                                  </div>
                                );
                              })}
                              <Button size="slim" icon={GlobeIcon} onClick={() => handleAutoTranslate(ref, loc.locale)} disabled={autoTranslatingKey === autoKey}>
                                {autoTranslatingKey === autoKey ? "Übersetze…" : "Übersetzen"}
                              </Button>
                            </InlineStack>
                            );
                          })
                        )}
                      </BlockStack>
                    )}

                    <InlineStack align="end" gap="150">
                      <Button size="slim" onClick={() => setEditingRefId(null)}>Abbrechen</Button>
                      <Button variant="primary" size="slim" onClick={() => saveEditRef(ref)}>Speichern</Button>
                    </InlineStack>
                  </BlockStack>
                </div>
              );
            }
            const { label, value } = splitMetaobjectFields(ref.fields);
            const hasTranslations = Object.values(translationData[ref.id]?.translations ?? {}).some(
              (list) => list?.some((t) => t.value?.trim())
            );
            return (
              <span key={ref.id} style={{ ...pill, cursor: "pointer" }} onClick={() => openEditRef(ref)}>
                {hasTranslations && <LocaleFlag locale={primaryLocale} round size={14} />}
                <Text as="span" variant="bodySm">
                  {label && <Text as="span" variant="bodySm" fontWeight="semibold">{label}: </Text>}
                  <Text as="span" variant="bodySm" tone="subdued">{value}</Text>
                </Text>
                <button onClick={(e) => { e.stopPropagation(); handleRemove(ref.id); }} style={removeBtn}>✕</button>
              </span>
            );
          })}
          {!showNewForm && (
            <Button size="micro" onClick={() => setShowNewForm(true)} disabled={!metaobjectType && references.length === 0}>
              +
            </Button>
          )}
        </div>

        {showNewForm && (
          <InlineStack gap="100" blockAlign="end">
            <div style={{ position: "relative" }}>
              <div ref={bezeichnungRef}>
                <TextField
                  label="Bezeichnung"
                  value={newDraft.bezeichnung}
                  onChange={(val) => { setNewDraft((d) => ({ ...d, bezeichnung: val })); setShowBezeichnungDropdown(true); }}
                  onFocus={() => setShowBezeichnungDropdown(true)}
                  onBlur={() => setTimeout(() => setShowBezeichnungDropdown(false), 150)}
                  autoComplete="off"
                />
              </div>
              <PositionedDropdown anchorRef={bezeichnungRef} open={showBezeichnungDropdown && filteredBezeichnungen.length > 0}>
                {filteredBezeichnungen.map((b) => (
                  <div key={b}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--p-color-border-subdued)" }}
                    onMouseDown={(e) => { e.preventDefault(); setNewDraft((d) => ({ ...d, bezeichnung: b })); setShowBezeichnungDropdown(false); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >{b}</div>
                ))}
              </PositionedDropdown>
            </div>
            <div style={{ position: "relative", width: 150 }}>
              <div ref={wertRef}>
                <TextField
                  label="Wert"
                  value={newDraft.wert}
                  onChange={(val) => { setNewDraft((d) => ({ ...d, wert: val })); setShowWertDropdown(true); }}
                  onFocus={() => setShowWertDropdown(true)}
                  onBlur={() => setTimeout(() => setShowWertDropdown(false), 150)}
                  autoComplete="off"
                />
              </div>
              <PositionedDropdown anchorRef={wertRef} open={showWertDropdown && filteredWerte.length > 0}>
                {filteredWerte.map((w) => (
                  <div key={w}
                    style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--p-color-border-subdued)" }}
                    onMouseDown={(e) => { e.preventDefault(); setNewDraft((d) => ({ ...d, wert: w })); setShowWertDropdown(false); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                  >{w}</div>
                ))}
              </PositionedDropdown>
            </div>
            <Button size="slim" onClick={() => { setShowNewForm(false); setNewDraft({ bezeichnung: "", wert: "" }); }}>Abbrechen</Button>
            <Button variant="primary" size="slim" onClick={handleCreateNew} disabled={!newDraft.bezeichnung.trim()}>
              Anlegen
            </Button>
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );
}

// Kleiner Uploader für Konfigurator-Bilder (Masken, Hintergrund, Shading) -
// nutzt useConfiguratorUpload (eigenständige Shopify-Datei, kein Produktbild),
// zeigt die fertige URL zum Kopieren an, damit sie manuell in das jeweilige
// canvas_*-Metafield eingetragen werden kann. Kein automatisches Verknüpfen
// mit einem bestimmten Feld - anders als bei Swatch-Bildern gibt es hier
// keine 1:1-Zuordnung (eine Datei kann in canvas_layers an beliebiger Stelle
// im JSON landen).
function ConfiguratorFileUpload({ setToast }) {
  const { upload, uploading, error, resultUrl, setResultUrl } = useConfiguratorUpload({ setToast });
  const [pickedFile, setPickedFile] = useState(null);
  const [filename, setFilename] = useState("");

  const handleFilePick = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPickedFile(file);
    setFilename(file.name);
    setResultUrl(null);
  };

  const handleUpload = () => {
    if (!pickedFile) return;
    upload(pickedFile, filename);
  };

  const copyUrl = () => {
    if (!resultUrl) return;
    navigator.clipboard?.writeText(resultUrl);
    setToast?.("URL kopiert");
  };

  return (
    <div style={{
      marginTop: 4, padding: 10, borderRadius: 6,
      border: "1px dashed var(--p-color-border)",
    }}>
      <BlockStack gap="150">
        <input type="file" accept="image/*" onChange={handleFilePick} style={{ fontSize: 12 }} />
        {pickedFile && (
          <InlineStack gap="150" blockAlign="end" wrap={false}>
            <div style={{ flex: 1 }}>
              <TextField label="Dateiname" labelHidden value={filename} onChange={setFilename} autoComplete="off" />
            </div>
            <Button size="slim" onClick={handleUpload} loading={uploading} disabled={uploading}>
              Hochladen
            </Button>
          </InlineStack>
        )}
        {error && <Text variant="bodyXs" tone="critical" as="p">{error}</Text>}
        {resultUrl && (
          <InlineStack gap="150" blockAlign="center" wrap={false}>
            <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              <Text variant="bodyXs" as="span">{resultUrl}</Text>
            </div>
            <Button size="slim" onClick={copyUrl}>Kopieren</Button>
          </InlineStack>
        )}
      </BlockStack>
    </div>
  );
}

export default function ProductDetailMetafields({ metafields, allMetafieldDefinitions = [], metaobjectTypeByFieldKey = {}, defaultMetafieldOrder = [], locales = [], shopId, fieldLabels: initialFieldLabels = {}, productId, fetcher, setToast }) {

  const orderFetcher = useFetcher();
  const metaTranslationFetcher = useFetcher();
  const saveMetaTranslationFetcher = useFetcher();
  const autoTranslateMetaFetcher = useFetcher();
  const labelFetcher = useFetcher();
  const [fieldLabels, setFieldLabels] = useState(initialFieldLabels);
  const [labelDrafts, setLabelDrafts] = useState({}); // `${key}:${locale}` -> value
  const [localMetafields, setLocalMetafields] = useState(metafields);
  const [orderedKeys, setOrderedKeys] = useState(() => computeInitialOrder(metafields, defaultMetafieldOrder));
  const [dragKey, setDragKey] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editingRefId, setEditingRefId] = useState(null); // global über alle Eigenschaften-Felder hinweg — nur eine Pill gleichzeitig offen
  const [drafts, setDrafts] = useState({});
  const [metaTranslationData, setMetaTranslationData] = useState({}); // { [fieldId]: { digest, translations: { locale: value } } }
  const [metaTranslationDrafts, setMetaTranslationDrafts] = useState({}); // `${fieldId}:${locale}` -> value
  const [autoTranslatingMetaKey, setAutoTranslatingMetaKey] = useState(null); // `${fieldId}:${locale}`

  const primaryLocale = locales.find((l) => l.primary)?.locale;
  const translationLocales = locales.filter((l) => !l.primary);
  const [showNew, setShowNew] = useState(false);
  const [showAddExisting, setShowAddExisting] = useState(false);
  const [showConfiguratorHelp, setShowConfiguratorHelp] = useState(false);
  const [newField, setNewField] = useState(EMPTY_NEW);
  const [existingSearch, setExistingSearch] = useState("");
  const [showKeyDropdown, setShowKeyDropdown] = useState(false);
  const [showValueDropdown, setShowValueDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Vorlage (bestehende Definition) ausgewählt? Dann sind Key/Typ fix, nur noch Wert nötig.
  const [selectedDefinition, setSelectedDefinition] = useState(null);
  const keyRef = useRef(null);
  const valueRef = useRef(null);
  const typeRef = useRef(null);

  // Sichtbare Felder (ohne interne/versteckte) in der gespeicherten Reihenfolge
  const visibleMetafields = localMetafields.filter((f) => !HIDDEN_KEYS.includes(f.key));
  const orderedVisibleFields = orderedKeys
    .map((k) => visibleMetafields.find((f) => f.key === k))
    .filter(Boolean);

  // orderedKeys mit neu angelegten/gelöschten Feldern synchron halten
  useEffect(() => {
    setOrderedKeys((prev) => {
      const currentKeys = visibleMetafields.map((f) => f.key);
      const kept = prev.filter((k) => currentKeys.includes(k));
      const added = currentKeys.filter((k) => !kept.includes(k));
      if (added.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...added];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localMetafields]);

  const persistOrder = (keys, scope) => {
    orderFetcher.submit(
      { action: "saveMetafieldOrder", scope, productId, order: JSON.stringify(keys) },
      { method: "POST" }
    );
  };

  const handleDrop = (targetKey) => {
    if (!dragKey || dragKey === targetKey) { setDragKey(null); return; }
    const next = [...orderedKeys];
    const fromIndex = next.indexOf(dragKey);
    const toIndex = next.indexOf(targetKey);
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, dragKey);
    setOrderedKeys(next);
    persistOrder(next, "product");
    setDragKey(null);
  };

  const loadDefaultOrder = () => {
    const next = computeInitialOrder(visibleMetafields, defaultMetafieldOrder);
    setOrderedKeys(next);
    persistOrder(next, "product");
    setToast?.("Standardreihenfolge geladen");
  };

  // Vorlagen: bereits im Store existierende Definitionen, die dieses Produkt noch nicht hat
  const availableDefinitions = allMetafieldDefinitions.filter(
    (def) => !localMetafields.some((f) => f.key === def.key)
  );
  const filteredExistingDefinitions = availableDefinitions.filter((def) =>
    def.name.toLowerCase().includes(existingSearch.toLowerCase())
  );

  const applyDefinition = (def) => {
    setSelectedDefinition(def);
    setNewField({
      name: def.name,
      key: def.key,
      type: def.type.name,
      value: def.type.name === METAOBJECT_REFERENCE_LIST ? "[]" : "",
    });
  };

  const closeAddExisting = () => {
    setShowAddExisting(false);
    setSelectedDefinition(null);
    setExistingSearch("");
    setNewField(EMPTY_NEW);
  };

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
    setEditingRefId(null);
    setEditingId(field.id);
    setDrafts((prev) => ({
      ...prev,
      [field.id]: { value: field.value ?? "", name: field.definition?.name ?? "" },
    }));
    if (TRANSLATABLE_TYPES.includes(field.type) && translationLocales.length > 0 && !metaTranslationData[field.id]) {
      metaTranslationFetcher.submit(
        { action: "getMetafieldTranslation", metafieldId: field.id, locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
        { method: "POST" }
      );
    }
  };

  useEffect(() => {
    if (metaTranslationFetcher.state !== "idle" || metaTranslationFetcher.data?.type !== "getMetafieldTranslation") return;
    const d = metaTranslationFetcher.data;
    setMetaTranslationData((prev) => ({ ...prev, [d.metafieldId]: { digest: d.digest, translations: d.translations } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaTranslationFetcher.state, metaTranslationFetcher.data]);

  useEffect(() => {
    if (saveMetaTranslationFetcher.state !== "idle" || saveMetaTranslationFetcher.data?.type !== "saveMetafieldTranslation") return;
    const d = saveMetaTranslationFetcher.data;
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    setMetaTranslationData((prev) => {
      const entry = prev[d.metafieldId];
      if (!entry) return prev;
      return { ...prev, [d.metafieldId]: { ...entry, translations: { ...entry.translations, [d.locale]: d.value } } };
    });
    setToast?.("Übersetzung gespeichert");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveMetaTranslationFetcher.state, saveMetaTranslationFetcher.data]);

  useEffect(() => {
    if (autoTranslateMetaFetcher.state !== "idle" || autoTranslateMetaFetcher.data?.type !== "autoTranslateMetafield") return;
    const d = autoTranslateMetaFetcher.data;
    setAutoTranslatingMetaKey(null);
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    setMetaTranslationData((prev) => {
      const entry = prev[d.metafieldId];
      if (!entry) return prev;
      return { ...prev, [d.metafieldId]: { ...entry, translations: { ...entry.translations, [d.locale]: d.value } } };
    });
    setMetaTranslationDrafts((prev) => {
      const next = { ...prev };
      delete next[`${d.metafieldId}:${d.locale}`];
      return next;
    });
    setToast?.("Automatisch übersetzt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslateMetaFetcher.state, autoTranslateMetaFetcher.data]);

  const saveMetaTranslation = (field, locale) => {
    const entry = metaTranslationData[field.id];
    if (!entry?.digest) return;
    const value = metaTranslationDrafts[`${field.id}:${locale}`] ?? entry.translations[locale] ?? "";
    saveMetaTranslationFetcher.submit(
      { action: "saveMetafieldTranslation", metafieldId: field.id, locale, value, digest: entry.digest },
      { method: "POST" }
    );
  };

  const handleAutoTranslateMeta = (field, locale) => {
    setAutoTranslatingMetaKey(`${field.id}:${locale}`);
    autoTranslateMetaFetcher.submit(
      { action: "autoTranslateMetafield", metafieldId: field.id, locale, sourceLocale: primaryLocale ?? "de" },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (labelFetcher.state !== "idle" || labelFetcher.data?.type !== "saveFieldLabel") return;
    const d = labelFetcher.data;
    if (!d.ok) { setToast?.(`Fehler: ${d.userErrors?.[0]?.message ?? "unbekannt"}`); return; }
    setFieldLabels((prev) => {
      const next = { ...prev, [d.locale]: { ...prev[d.locale] } };
      if (d.label) next[d.locale][d.key] = d.label; else delete next[d.locale][d.key];
      return next;
    });
    setToast?.("Shop-Label gespeichert");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelFetcher.state, labelFetcher.data]);

  const labelDraftKey = (key, locale) => `${key}:${locale}`;

  const saveFieldLabel = (field, locale) => {
    const dk = labelDraftKey(field.key, locale);
    const value = labelDrafts[dk] ?? fieldLabels[locale]?.[field.key] ?? "";
    labelFetcher.submit(
      { action: "saveFieldLabel", shopId, locale, key: field.key, label: value },
      { method: "POST" }
    );
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
      },
      { method: "POST" }
    );
    setEditingId(null);
  };

  const handleCreate = () => {
    if (!newField.key.trim()) return;
    const key = stripNamespacePrefix(newField.key.trim());
    fetcher.submit(
      { action: "createMetafield", productId, namespace: "custom", name: newField.name || key, key, type: newField.type, value: newField.value },
      { method: "POST" }
    );
    setShowNew(false);
    setNewField(EMPTY_NEW);
  };

  const handleCreateExisting = () => {
    if (!newField.key.trim()) return;
    const key = stripNamespacePrefix(newField.key.trim());
    fetcher.submit(
      { action: "createMetafield", productId, namespace: "custom", name: newField.name, key, type: newField.type, value: newField.value },
      { method: "POST" }
    );
    closeAddExisting();
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
      if (fetcher.data.nameError) {
        setToast?.(`Name nicht gespeichert: ${fetcher.data.nameError}`);
      } else {
        setToast?.("Metafield gespeichert");
      }
    }

    if (fetcher.data.type === "createMetafield") {
      if (fetcher.data.metafield) {
        setLocalMetafields(prev => [...prev, fetcher.data.metafield]);
      }
      setToast?.(fetcher.data.error ? `Fehler: ${fetcher.data.error}` : "Metafield erstellt");
    }

    if (fetcher.data.type === "deleteMetafield") {
      setLocalMetafields(prev => prev.filter(f => f.id !== fetcher.data.metafieldId));
      setToast?.("Metafield gelöscht");
    }
  }, [fetcher.state, fetcher.data]);

  const requestDelete = (field) => setDeleteTarget(field);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    fetcher.submit(
      { action: "deleteMetafield", metafieldId: deleteTarget.id, productId, namespace: deleteTarget.namespace, key: deleteTarget.key },
      { method: "POST" }
    );
    setDeleteTarget(null);
  };

return (
  <>
    <BlockStack gap="300">
      <InlineStack align="space-between" blockAlign="center">
        <Text variant="headingSm">Metafields</Text>
        <InlineStack gap="400" blockAlign="center">
          <Link monochrome removeUnderline={false} onClick={() => setShowConfiguratorHelp((v) => !v)}>
            <Text variant="bodyXs" tone="subdued" as="span">
              {showConfiguratorHelp ? "Anleitung ausblenden" : "Wie richte ich Konfigurator ein?"}
            </Text>
          </Link>
          <InlineStack gap="150">
            {availableDefinitions.length > 0 && (
              <Button
                size="micro"
                onClick={() => { showAddExisting ? closeAddExisting() : setShowAddExisting(true); setShowNew(false); }}
              >
                {showAddExisting ? "Abbrechen" : "+ Vorhandenes"}
              </Button>
            )}
            <Button
              size="micro"
              onClick={() => {
                if (showNew) { setShowNew(false); return; }
                setShowNew(true);
                closeAddExisting();
              }}
            >
              {showNew ? "Abbrechen" : "+ Neu"}
            </Button>
            {defaultMetafieldOrder.length > 0 && (
              <Button size="micro" onClick={loadDefaultOrder}>
                Standardreihenfolge laden
              </Button>
            )}
          </InlineStack>
        </InlineStack>
      </InlineStack>

      {showConfiguratorHelp && (
        <div style={{
          padding: "14px 14px 14px 0", borderRadius: 8,
        }}>
          <BlockStack gap="200">
            <Text variant="headingXs" tone="subdued">Neues Konfigurator-Produkt einrichten</Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              Das <code>custom.</code> vor den Feldnamen unten ist nur die Code-Schreibweise (Liquid/Theme) — beim Anlegen einer Definition in Shopify ist Namespace (<code>custom</code>) und Schlüssel getrennt, "custom." also nicht mit eintippen.
            </Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>1. Produkt anlegen</strong> — ganz normal (Titel, Beschreibung, Preis, mind. eine Variante). Kein Foto nötig, das übernimmt der Konfigurator.
            </Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>2. Bilder hochladen</strong> — Masken (eine Silhouette pro einfärbbarer Ebene, Rest transparent), optional Hintergrund hell/dunkel und Shading-Overlay. Direkt hier hochladen (landet nicht in der Produkt-Bildergalerie, nur als Datei mit URL). Dateinamen immer mit <code>canvas-</code>-Präfix, damit man sie später in Shopifys Dateiliste (Einstellungen → Dateien) wiederfindet, z. B. zum Löschen/Ersetzen: <code>canvas-&lt;produkt&gt;-mask-koerper.png</code>, <code>canvas-&lt;produkt&gt;-hintergrund-hell.png</code>, <code>canvas-&lt;produkt&gt;-hintergrund-dunkel.png</code>, <code>canvas-&lt;produkt&gt;-shading.png</code>. Nach dem Upload URL kopieren und weiter unten ins passende Feld einfügen.
            </Text>
            <ConfiguratorFileUpload setToast={setToast} />
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>3. Aktivierung</strong> — <code>custom.canvas_configurator</code> = <code>true</code> und <code>custom.canvas_engine</code> = <code>generic</code> setzen (kein anderer Wert vorgesehen — leer/falsch = altes, Geschirr-spezifisches System mit falschen Masken für jedes andere Produkt). Ohne beide zeigt das Theme keine Canvas-Vorschau bzw. nutzt den falschen Pfad.
            </Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>4. Ebenen</strong> — <code>custom.canvas_layers</code> (JSON), ein Eintrag pro Ebene:
            </Text>
            <pre style={{
              fontSize: 10, lineHeight: 1.4, margin: 0, padding: 8, borderRadius: 6,
              background: "var(--p-color-bg-surface-secondary)",
              overflowX: "auto", whiteSpace: "pre",
            }}>
{`[{"key":"gurt","property":"Gurtband Farbe","mask":"https://.../mask-gurt.png",
  "outline":true,"shadingCutout":false,"metallic":false,
  "options":[
    {"name":"Weiss","hex":"#FFFFFF","title":"Weiss"},
    {"name":"Pink","hex":"#F06EB0","default":true},
    {"name":"Camo","pattern":"https://.../muster.jpg","scale":0.5}
  ]}]`}
            </pre>
            <Text variant="bodyXs" tone="subdued" as="p">
              Pro Ebene: <code>key</code> eindeutige ID, <code>property</code> Anzeigename (weglassen = nicht wählbar), <code>mask</code> Maskenbild aus Schritt 2, <code>outline</code> trägt zum Schatten-Umriss bei, <code>shadingCutout</code> aus <code>canvas_shading</code> aussparen, <code>metallic</code> Ring-Glanz statt Flachfarbe. Pro Option: entweder <code>hex</code> (Flachfarbe) oder <code>pattern</code> (Muster-URL), nie beides. Reihenfolge im Array = Zeichenreihenfolge (unten drüber). Ausführliches Schema mit allen Details: <code>CONFIGURATOR.md</code> im rexpaw-storefront-Repo (für Entwickler-Zugriff).
            </Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>5. Optional</strong> — <code>custom.canvas_shading</code> (reine Bild-URL, kein JSON), <code>custom.canvas_background</code> (<code>{'{"light":"URL","dark":"URL"}'}</code>), <code>custom.canvas_outline_scale</code> (Dezimalzahl, Standard <code>1.035</code> — wirkt nur, wenn mindestens eine Ebene in <code>canvas_layers</code> <code>"outline": true</code> hat; sonst ohne Effekt und kann leer bleiben. Nicht nötig, wenn euer Hintergrundbild schon einen eigenen Schatten mitbringt).
              {" "}<strong>Shading-Bild erstellen:</strong> Produktfoto (freigestellt) nehmen → entsättigen (Schwarzweiß) → mit Gradationskurven/Tonwertkorrektur aufhellen, bis fast alles weiß ist und nur echte Schatten (Kanten, Vertiefungen, Prägungen) grau sichtbar bleiben — Weiß = keine Wirkung, Dunkel = Abdunkelung (Multiply-Modus). Als PNG mit Transparenz exportieren.
            </Text>
            <Text variant="bodyXs" tone="subdued" as="p">
              <strong>6. Prüfen</strong> — Produktseite im Storefront öffnen. Bei fehlerhafter/fehlender <code>canvas_layers</code>-Konfiguration bleibt die Vorschau einfach leer, kein Fehler auf der Seite.
            </Text>
          </BlockStack>
        </div>
      )}

      <Divider />

      {/* komplett neu anlegen */}
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
                    onChange={() => {}}
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

      {/* vorhandene Definition hinzufügen */}
      {showAddExisting && (
        <div style={{
          padding: 12, borderRadius: 8,
          border: "1px dashed var(--p-color-border)",
          background: "var(--p-color-bg-surface-secondary)",
        }}>
          {selectedDefinition ? (
            <BlockStack gap="200">
              <InlineStack gap="100" blockAlign="center">
                <Text variant="bodySm" tone="subdued">Feld:</Text>
                <Text variant="bodySm" fontWeight="semibold">{newField.name}</Text>
                <button onClick={() => { setSelectedDefinition(null); setNewField(EMPTY_NEW); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--p-color-text-subdued)" }}>
                  ✕
                </button>
              </InlineStack>
              {newField.type === METAOBJECT_REFERENCE_LIST ? (
                <Text variant="bodySm" tone="subdued">
                  Wird leer angelegt — Einträge fügst du danach direkt bei diesem Feld hinzu.
                </Text>
              ) : (
                <div style={{ maxWidth: 320 }}>
                  <TextField
                    label="Wert"
                    value={newField.value}
                    onChange={(val) => setNewField((f) => ({ ...f, value: val }))}
                    autoComplete="off"
                  />
                </div>
              )}
              <InlineStack gap="200" align="end">
                <Button size="slim" onClick={closeAddExisting}>Abbrechen</Button>
                <Button variant="primary" size="slim" onClick={handleCreateExisting}>
                  Speichern
                </Button>
              </InlineStack>
            </BlockStack>
          ) : (
            <BlockStack gap="200">
              <TextField
                label="Feld suchen"
                value={existingSearch}
                onChange={setExistingSearch}
                autoComplete="off"
                placeholder="z.B. Material"
              />
              <BlockStack gap="0">
                {filteredExistingDefinitions.length === 0 ? (
                  <Text variant="bodySm" tone="subdued">Keine passenden Felder gefunden</Text>
                ) : (
                  filteredExistingDefinitions.map((def) => (
                    <div key={def.id}
                      style={{ padding: "8px 4px", cursor: "pointer", borderBottom: "1px solid var(--p-color-border-subdued)" }}
                      onClick={() => applyDefinition(def)}
                    >
                      <Text variant="bodySm" fontWeight="semibold" as="span">{def.name}</Text>
                      <Text variant="bodyXs" tone="subdued" as="span"> ({def.key})</Text>
                    </div>
                  ))
                )}
              </BlockStack>
              <InlineStack align="end">
                <Button size="slim" onClick={closeAddExisting}>Abbrechen</Button>
              </InlineStack>
            </BlockStack>
          )}
        </div>
      )}

      {/* bestehende editieren */}
      {orderedVisibleFields.length > 0 ? (
        <BlockStack gap="0">
          {orderedVisibleFields.map((field) => {
            // Ziehen startet nur am Handle, Ablegen funktioniert überall auf der Zeile
            const dragSourceProps = {
              draggable: true,
              onDragStart: () => setDragKey(field.key),
              onDragEnd: () => setDragKey(null),
            };
            const dragTargetProps = {
              onDragOver: (e) => e.preventDefault(),
              onDrop: (e) => { e.preventDefault(); handleDrop(field.key); },
            };
            const dragHandle = (
              <span
                {...dragSourceProps}
                style={{ cursor: "grab", color: "var(--p-color-text-subdued)", flexShrink: 0, userSelect: "none" }}
                title="Ziehen zum Sortieren"
              >
                ⠿
              </span>
            );

            if (field.type === METAOBJECT_REFERENCE_LIST) {
              return (
                <div key={field.id} {...dragTargetProps} style={{ opacity: dragKey === field.key ? 0.5 : 1 }}>
                  <MetaobjectReferenceField
                    field={field}
                    productId={productId}
                    locales={locales}
                    setToast={setToast}
                    onDelete={requestDelete}
                    dragHandle={dragHandle}
                    editingRefId={editingRefId}
                    setEditingRefId={setEditingRefId}
                    closeOtherEditors={() => setEditingId(null)}
                    shopId={shopId}
                    metaobjectTypeByFieldKey={metaobjectTypeByFieldKey}
                    fieldLabels={fieldLabels}
                    labelDrafts={labelDrafts}
                    setLabelDrafts={setLabelDrafts}
                    saveFieldLabel={saveFieldLabel}
                    labelDraftKey={labelDraftKey}
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
                </div>
              );
            }
            const isEditing = editingId === field.id;
            return (
              <div key={field.id} {...dragTargetProps} style={{
                padding: "3px 0",
                borderTop: isEditing ? "1px solid rgba(128,128,128,0.5)" : "1px solid transparent",
                borderBottom: isEditing ? "1px solid rgba(128,128,128,0.5)" : "1px solid var(--p-color-border-subdued)",
                opacity: dragKey === field.key ? 0.5 : 1,
              }}>
                <InlineStack align="space-between" blockAlign="center" wrap={false}>
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    {dragHandle}
                    {!isEditing && (
                      <div style={{ minWidth: 100, display: "flex", alignItems: "center", gap: 4 }}>
                        <Text variant="bodySm" fontWeight="semibold" as="span">{field.definition?.name || field.key}</Text>
                        <Text variant="bodyXs" tone="subdued" as="span"> ({field.key})</Text>
                        {field.definition?.description && (
                          <Tooltip content={field.definition.description} dismissOnMouseOut>
                            <span style={{ display: "inline-flex", cursor: "help" }}>
                              <Icon source={InfoIcon} tone="subdued" />
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    )}
                    {!isEditing && (
                      <Text variant="bodySm" tone="subdued">{field.value || "—"}</Text>
                    )}
                  </InlineStack>
                  <InlineStack gap="150" blockAlign="center" wrap={false}>
                    <button
                      onClick={() => isEditing ? setEditingId(null) : openEdit(field)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--p-color-border)",
                        borderRadius: 4, cursor: "pointer",
                        width: 28, height: 28,
                        display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ display: "flex", transform: isEditing ? "scale(1.2)" : "none" }}>
                        <Icon source={isEditing ? XIcon : EditIcon} tone="subdued" />
                      </span>
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

                {isEditing && (
                  <div style={{
                    width: "100%", marginTop: 10, padding: 10, borderRadius: 8,
                    border: "1px dashed var(--p-color-border)",
                  }}>
                    <BlockStack gap="100">
                      <InlineStack gap="100" blockAlign="start" wrap={false}>
                        {primaryLocale && (
                          <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", marginRight: 6, paddingTop: 22 }}>
                            <LocaleFlag locale={primaryLocale} size={20} round />
                          </div>
                        )}
                        <div style={{ width: 160 }}>
                          <Text variant="bodyXs" tone="subdued" as="p">Name</Text>
                          <div style={{ marginTop: 6 }}>
                            <TextField
                              label="Name"
                              labelHidden
                              value={drafts[field.id]?.name ?? ""}
                              onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: { ...prev[field.id], name: val } }))}
                              autoComplete="off"
                            />
                          </div>
                        </div>
                        <div style={{ width: 150, flex: 1 }}>
                          <Text variant="bodyXs" tone="subdued" as="p">Wert</Text>
                          <div style={{ marginTop: 6 }}>
                            <TextField
                              label="Wert"
                              labelHidden
                              value={drafts[field.id]?.value ?? ""}
                              onChange={(val) => setDrafts((prev) => ({ ...prev, [field.id]: { ...prev[field.id], value: val } }))}
                              multiline={isMultiline(field.type) ? 3 : undefined}
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      </InlineStack>

                      {translationLocales.length > 0 && (
                        <BlockStack gap="100">
                          {translationLocales.map((loc) => {
                            const isTranslatable = TRANSLATABLE_TYPES.includes(field.type);
                            const autoKey = `${field.id}:${loc.locale}`;
                            const dk = `${field.id}:${loc.locale}`;
                            const labelDk = labelDraftKey(field.key, loc.locale);
                            const labelValue = labelDrafts[labelDk] ?? fieldLabels[loc.locale]?.[field.key] ?? "";
                            const entry = metaTranslationData[field.id];
                            const existing = entry?.translations?.[loc.locale] ?? "";
                            return (
                              <InlineStack key={loc.locale} gap="100" blockAlign="center" wrap={false}>
                                <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", marginRight: 6 }}>
                                  <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
                                </span>
                                <div style={{ width: 160 }}>
                                  <TextField
                                    label=""
                                    labelHidden
                                    placeholder={(primaryLocale && fieldLabels[primaryLocale]?.[field.key]) || keyDerivedLabel(field.key)}
                                    value={labelValue}
                                    onChange={(val) => setLabelDrafts((prev) => ({ ...prev, [labelDk]: val }))}
                                    onBlur={() => saveFieldLabel(field, loc.locale)}
                                    autoComplete="off"
                                  />
                                </div>
                                {isTranslatable && (
                                  <>
                                    <div style={{ width: 150 }}>
                                      <TextField
                                        label=""
                                        labelHidden
                                        disabled={!entry?.digest}
                                        placeholder={!entry ? "Lade…" : entry.digest ? (drafts[field.id]?.value ?? field.value ?? "Wert") : "Erst Original speichern"}
                                        value={metaTranslationDrafts[dk] ?? existing}
                                        onChange={(val) => setMetaTranslationDrafts((prev) => ({ ...prev, [dk]: val }))}
                                        onBlur={() => saveMetaTranslation(field, loc.locale)}
                                        autoComplete="off"
                                      />
                                    </div>
                                    <Button size="slim" icon={GlobeIcon} disabled={!entry?.digest || autoTranslatingMetaKey === autoKey} onClick={() => handleAutoTranslateMeta(field, loc.locale)}>
                                      {autoTranslatingMetaKey === autoKey ? "Übersetze…" : "Übersetzen"}
                                    </Button>
                                  </>
                                )}
                              </InlineStack>
                            );
                          })}
                        </BlockStack>
                      )}

                      <InlineStack align="end" gap="150">
                        <Button size="slim" onClick={() => setEditingId(null)}>Abbrechen</Button>
                        <Button variant="primary" size="slim" onClick={() => handleSave(field)}>Speichern</Button>
                      </InlineStack>
                    </BlockStack>
                  </div>
                )}
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
  </>
);
}
