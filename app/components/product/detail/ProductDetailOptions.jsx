import { BlockStack, Text, Button, InlineStack, Divider, TextField, Icon } from "@shopify/polaris";
import { EditIcon, GlobeIcon, ImageAddIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";
import LocaleFlag from "../../shared/LocaleFlag.jsx";

export default function ProductDetailOptions({
  optionDrafts, setOptionDrafts, optionsDirty, handleOptionsSave, locales = [],
  productId, productImages = [], optionSwatches: initialOptionSwatches = {},
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [newOptionValues, setNewOptionValues] = useState({});
  const [openNewValue, setOpenNewValue] = useState({});
  const [editingOptionName, setEditingOptionName] = useState({});
  const optionNameRefs = useRef({});
  const newValueRefs = useRef({});

  // ── Minibilder (Swatches) pro Optionswert — eigenes JSON-Metafield am Produkt ──
  const [optionSwatches, setOptionSwatches] = useState(initialOptionSwatches);
  const [swatchPickerFor, setSwatchPickerFor] = useState(null); // `${oi}:${value}` | null
  const [colorDraft, setColorDraft] = useState(null); // { key, color } — Vorschau vor "Übernehmen"
  const saveSwatchFetcher = useFetcher();

  // Eigenständiger Muster-Upload (nicht in der Bildergalerie) — 2-Schritt wie beim normalen
  // Bild-Upload: staged upload → S3 → fileCreate (siehe uploadSwatchFile-Action).
  const stageSwatchFetcher = useFetcher();
  const linkSwatchFetcher = useFetcher();
  const [uploadingSwatchFor, setUploadingSwatchFor] = useState(null); // `${oi}:${value}` | null
  const pendingSwatchFile = useRef(null);
  const pendingSwatchTarget = useRef(null); // { optionName, valueName }
  const swatchFileInputRef = useRef(null);

  const uploadSwatchPattern = (file, optionName, valueName) => {
    if (!file) return;
    pendingSwatchFile.current = file;
    pendingSwatchTarget.current = { optionName, valueName };
    setUploadingSwatchFor(`${optionName}:${valueName}`);
    stageSwatchFetcher.submit(
      { action: "uploadSwatchFile", step: "stage", filename: file.name, mimeType: file.type },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (stageSwatchFetcher.state !== "idle" || !stageSwatchFetcher.data?.stagedTarget) return;
    const { url, parameters, resourceUrl } = stageSwatchFetcher.data.stagedTarget;
    const file = pendingSwatchFile.current;
    if (!file) return;
    const fd = new FormData();
    parameters.forEach(({ name, value }) => fd.append(name, value));
    fd.append("file", file);
    fetch(url, { method: "POST", body: fd })
      .then((res) => {
        if (!res.ok) throw new Error(`Upload fehlgeschlagen: ${res.status}`);
        linkSwatchFetcher.submit(
          { action: "uploadSwatchFile", step: "link", resourceUrl },
          { method: "POST" }
        );
      })
      .catch(() => setUploadingSwatchFor(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageSwatchFetcher.state, stageSwatchFetcher.data]);

  useEffect(() => {
    if (linkSwatchFetcher.state !== "idle" || !linkSwatchFetcher.data) return;
    const d = linkSwatchFetcher.data;
    const target = pendingSwatchTarget.current;
    setUploadingSwatchFor(null);
    if (d.ok && target && d.fileUrl) {
      setSwatch(target.optionName, target.valueName, { imageId: d.fileId, imageUrl: d.fileUrl });
    }
    pendingSwatchFile.current = null;
    pendingSwatchTarget.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSwatchFetcher.state, linkSwatchFetcher.data]);

  // swatch: { imageId, imageUrl } für ein Bild, { color } für eine Farbe, oder null zum Entfernen
  const setSwatch = (optionName, valueName, swatch) => {
    setOptionSwatches((prev) => {
      const next = { ...prev, [optionName]: { ...(prev[optionName] ?? {}) } };
      if (swatch) next[optionName][valueName] = swatch;
      else delete next[optionName][valueName];
      if (Object.keys(next[optionName]).length === 0) delete next[optionName];
      return next;
    });
    saveSwatchFetcher.submit(
      {
        action: "saveOptionSwatch",
        id: productId,
        optionName,
        valueName,
        imageId: swatch?.imageId ?? "",
        imageUrl: swatch?.imageUrl ?? "",
        color: swatch?.color ?? "",
      },
      { method: "POST" }
    );
    setSwatchPickerFor(null);
  };

  // ── Übersetzung von Optionsname + Optionswerten ──
  const primaryLocale = locales.find((l) => l.primary)?.locale;
  const translationLocales = locales.filter((l) => !l.primary);
  const optionTranslationFetcher = useFetcher();
  const saveOptionTranslationFetcher = useFetcher();
  const autoTranslateOptionFetcher = useFetcher();
  const [optionTranslationData, setOptionTranslationData] = useState({}); // { [resourceId]: { digest, translations: { locale: value } } }
  const [optionTranslationDrafts, setOptionTranslationDrafts] = useState({}); // `${id}:${locale}` -> value
  const [autoTranslatingOptionKey, setAutoTranslatingOptionKey] = useState(null); // `${oi}:${locale}`

  const valueIdFor = (option, valueName) => option.optionValues?.find((v) => v.name === valueName)?.id;

  const toggleOptionTranslationFetch = (option) => {
    const ids = [option.id, ...(option.values ?? []).map((v) => valueIdFor(option, v))].filter(Boolean);
    const missing = ids.filter((id) => !optionTranslationData[id]);
    if (missing.length === 0 || translationLocales.length === 0) return;
    optionTranslationFetcher.submit(
      { action: "getOptionTranslations", ids: JSON.stringify(missing), locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (optionTranslationFetcher.state !== "idle" || optionTranslationFetcher.data?.type !== "getOptionTranslations") return;
    setOptionTranslationData((prev) => ({ ...prev, ...optionTranslationFetcher.data.data }));
  }, [optionTranslationFetcher.state, optionTranslationFetcher.data]);

  useEffect(() => {
    if (saveOptionTranslationFetcher.state !== "idle" || saveOptionTranslationFetcher.data?.type !== "saveOptionTranslation") return;
    const d = saveOptionTranslationFetcher.data;
    if (!d.ok) return;
    setOptionTranslationData((prev) => {
      const entry = prev[d.id];
      if (!entry) return prev;
      return { ...prev, [d.id]: { ...entry, translations: { ...entry.translations, [d.locale]: d.value } } };
    });
  }, [saveOptionTranslationFetcher.state, saveOptionTranslationFetcher.data]);

  const saveOptionTranslation = (id, locale) => {
    const entry = optionTranslationData[id];
    if (!entry?.digest) return;
    const dk = `${id}:${locale}`;
    const value = optionTranslationDrafts[dk] ?? entry.translations[locale] ?? "";
    saveOptionTranslationFetcher.submit(
      { action: "saveOptionTranslation", id, locale, value, digest: entry.digest },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (autoTranslateOptionFetcher.state !== "idle" || autoTranslateOptionFetcher.data?.type !== "autoTranslateOption") return;
    const d = autoTranslateOptionFetcher.data;
    setAutoTranslatingOptionKey(null);
    if (!d.ok) return;
    setOptionTranslationData((prev) => {
      const next = { ...prev };
      for (const r of d.results) {
        if (!next[r.id]) continue;
        next[r.id] = { ...next[r.id], translations: { ...next[r.id].translations, [d.locale]: r.value } };
      }
      return next;
    });
    setOptionTranslationDrafts((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (k.endsWith(`:${d.locale}`)) delete next[k];
      }
      return next;
    });
  }, [autoTranslateOptionFetcher.state, autoTranslateOptionFetcher.data]);

  const handleAutoTranslateOption = (oi, option, locale) => {
    const ids = [option.id, ...(option.values ?? []).map((v) => valueIdFor(option, v)).filter(Boolean)];
    setAutoTranslatingOptionKey(`${oi}:${locale}`);
    autoTranslateOptionFetcher.submit(
      { action: "autoTranslateOption", ids: JSON.stringify(ids), locale, sourceLocale: primaryLocale ?? "de" },
      { method: "POST" }
    );
  };

  const addValue = (oi, option) => {
    const val = newOptionValues[oi]?.trim();
    if (!val) return;
    const updated = [...optionDrafts];
    updated[oi] = { ...option, values: [...(option.values ?? []), val] };
    setOptionDrafts(updated);
    setNewOptionValues((prev) => ({ ...prev, [oi]: "" }));
    setOpenNewValue((prev) => ({ ...prev, [oi]: false }));
    // Auto-Speichern
    //setTimeout(() => handleOptionsSave(), 0);
  };

  useEffect(() => {
    Object.keys(editingOptionName).forEach((oi) => {
      if (editingOptionName[oi]) {
        setTimeout(() => optionNameRefs.current[oi]?.querySelector("input")?.focus(), 50);
      }
    });
  }, [editingOptionName]);

  useEffect(() => {
    Object.keys(openNewValue).forEach((oi) => {
      if (openNewValue[oi]) {
        setTimeout(() => newValueRefs.current[oi]?.focus(), 50);
      }
    });
  }, [openNewValue]);

  return (
    <>
        <BlockStack gap="200">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <Text variant="headingSm">Optionen</Text>
            {optionDrafts.length > 0 && (
              <Button size="slim"
                  onClick={handleOptionsSave}
                  disabled={!optionsDirty}>
                Speichern
              </Button>
            )}
          </InlineStack>
          <Divider />

          {optionDrafts.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {optionDrafts.map((option, oi) => (
                <div
                  key={option.id ?? oi}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {/* Optionsname: readonly + Edit-Button */}
                  <InlineStack blockAlign="center" gap="300">
                    {!editingOptionName[oi] && (
                      <Text variant="bodySm" fontWeight="semibold">
                        {option.name || <span style={{ color: "var(--p-color-text-subdued)" }}>Name...</span>}
                      </Text>
                    )}
                    <Button
                      size="micro"
                      variant="plain"
                      icon={EditIcon}
                      accessibilityLabel="Optionsname bearbeiten & übersetzen"
                      onClick={() => {
                        const willOpen = !editingOptionName[oi];
                        setEditingOptionName((prev) => ({ ...prev, [oi]: willOpen }));
                        if (willOpen) toggleOptionTranslationFetch(option);
                      }}
                    />
                  </InlineStack>

                  {editingOptionName[oi] && (
                    <div style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      padding: 10, borderRadius: 8,
                      border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                      background: isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)",
                    }}>
                      {/* Deutsch: editierbarer Optionsname */}
                      <InlineStack gap="100" blockAlign="center" wrap={false}>
                        {primaryLocale && (
                          <span style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                            <LocaleFlag locale={primaryLocale} size={20} round />
                          </span>
                        )}
                        <div style={{ width: 100 }}>
                          <TextField
                            label="" labelHidden autoComplete="off"
                            placeholder="z.B. Größe"
                            value={option.name}
                            onChange={(val) => {
                              const updated = [...optionDrafts];
                              updated[oi] = { ...option, name: val };
                              setOptionDrafts(updated);
                            }}
                          />
                        </div>
                        <Text variant="bodyXs" tone="subdued" as="p">
                          Das Kürzel-Feld rechts neben jedem Wert wird für die automatische SKU-Generierung verwendet (z.&nbsp;B. Blau → <code>bl</code>).
                        </Text>
                      </InlineStack>

                      {/* Werte + SKU-Kürzel: keine Übersetzung, sondern Name & Zuordnung für die Artikelnummer */}
                      <div>
                        <InlineStack gap="100" wrap={false}>
                          <div style={{ width: 20, flexShrink: 0 }} />
                          <div style={{ width: 100 }}>
                            <Text variant="bodyXs" tone="subdued" as="p">Name</Text>
                          </div>
                          <div style={{ width: 70 }}>
                            <Text variant="bodyXs" tone="subdued" as="p">SKU-Kürzel</Text>
                          </div>
                          <div style={{ width: 28, flexShrink: 0 }} />
                        </InlineStack>
                        <div style={{ height: 8 }} />
                        <BlockStack gap="100">
                          {(option.values ?? []).map((v, vIdx) => {
                            const swatchKey = `${oi}:${v}`;
                            const swatch = optionSwatches[option.name]?.[v];
                            return (
                            <InlineStack key={`${v}-${vIdx}`} gap="100" blockAlign="center" wrap={false}>
                              <div style={{ width: 20, flexShrink: 0 }} />
                              <div style={{ width: 100 }}>
                                <TextField
                                  label="" labelHidden autoComplete="off"
                                  value={v}
                                  onChange={(newName) => {
                                    const updated = [...optionDrafts];
                                    const newValues = [...option.values];
                                    newValues[vIdx] = newName;
                                    const newAbbr = { ...(option.abbreviations ?? {}) };
                                    if (v !== newName) {
                                      newAbbr[newName] = newAbbr[v] ?? "";
                                      delete newAbbr[v];
                                    }
                                    updated[oi] = { ...option, values: newValues, abbreviations: newAbbr };
                                    setOptionDrafts(updated);
                                  }}
                                />
                              </div>
                              <div style={{ width: 70 }}>
                                <TextField
                                  label="" labelHidden autoComplete="off"
                                  placeholder="???"
                                  value={option.abbreviations?.[v] ?? ""}
                                  onChange={(val) => {
                                    const updated = [...optionDrafts];
                                    updated[oi] = { ...option, abbreviations: { ...(option.abbreviations ?? {}), [v]: val } };
                                    setOptionDrafts(updated);
                                  }}
                                />
                              </div>
                              <div style={{ width: 28, flexShrink: 0, position: "relative" }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSwatchPickerFor((cur) => cur === swatchKey ? null : swatchKey);
                                    setColorDraft(null);
                                  }}
                                  title="Farbe oder Minibild wählen"
                                  style={{
                                    width: 26, height: 26, borderRadius: "50%", padding: 0, cursor: "pointer",
                                    border: `1px solid ${isDark ? "#6b6b6b" : "#8c8c8c"}`,
                                    background: swatch?.color ? swatch.color : swatch?.imageUrl ? `url(${swatch.imageUrl}) center/cover` : (isDark ? "#3a3a3a" : "#e3e3e3"),
                                    overflow: "hidden",
                                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                                  }}
                                />
                                {swatchPickerFor === swatchKey && (
                                  <div style={{
                                    position: "absolute", top: 32, right: 0, zIndex: 1000,
                                    display: "flex", flexDirection: "column", gap: 8, width: 260,
                                    padding: 10, borderRadius: 8,
                                    border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                                    background: isDark ? "#2c2c2c" : "#fff",
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
                                  }}>
                                    <div>
                                      <Text variant="bodyXs" tone="subdued" as="p">Farbe</Text>
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                                        <input
                                          type="color"
                                          className="rexpaw-color-swatch"
                                          value={(colorDraft?.key === swatchKey ? colorDraft.color : swatch?.color) ?? "#cccccc"}
                                          onChange={(e) => setColorDraft({ key: swatchKey, color: e.target.value })}
                                          style={{
                                            width: 28, height: 28, padding: 0, border: "none", cursor: "pointer",
                                            background: "transparent", borderRadius: "50%", overflow: "hidden",
                                            WebkitAppearance: "none", appearance: "none",
                                          }}
                                        />
                                        {colorDraft?.key === swatchKey && (
                                        <Button
                                          size="micro"
                                          onClick={() => { setSwatch(option.name, v, { color: colorDraft.color }); setColorDraft(null); }}
                                        >
                                          Übernehmen
                                        </Button>
                                        )}
                                      </div>
                                    </div>

                                    <div>
                                      <Text variant="bodyXs" tone="subdued" as="p">Bild</Text>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                        {productImages.length === 0 && (
                                          <Text variant="bodyXs" tone="subdued">Keine Produktbilder vorhanden</Text>
                                        )}
                                        {productImages.map((img) => (
                                          <button
                                            key={img.id}
                                            type="button"
                                            onClick={() => setSwatch(option.name, v, { imageId: img.id, imageUrl: img.url })}
                                            title={img.altText || ""}
                                            style={{
                                              width: 28, height: 28, borderRadius: 4, padding: 0, cursor: "pointer",
                                              border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                                              background: `url(${img.url}) center/cover`,
                                            }}
                                          />
                                        ))}
                                      </div>
                                      <div style={{ marginTop: 6 }}>
                                        <label
                                          htmlFor={`swatch-upload-${swatchKey}`}
                                          style={{
                                            display: "inline-flex", alignItems: "center", gap: 6,
                                            padding: "4px 8px", borderRadius: 6,
                                            border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                                            background: isDark ? "#3a3a3a" : "#f0f0f0",
                                            fontSize: 11, cursor: "pointer",
                                          }}
                                        >
                                          <Icon source={ImageAddIcon} tone="base" />
                                          {uploadingSwatchFor === `${option.name}:${v}` ? "Lädt…" : "Eigenes Thumbnail hochladen"}
                                        </label>
                                        <input
                                          id={`swatch-upload-${swatchKey}`}
                                          type="file"
                                          accept="image/*"
                                          style={{ display: "none" }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) uploadSwatchPattern(file, option.name, v);
                                            e.target.value = "";
                                          }}
                                        />
                                        <div style={{ marginTop: 4 }}>
                                          <Text variant="bodyXs" tone="subdued">Am besten 128×128px und quadratisch</Text>
                                        </div>
                                      </div>
                                    </div>

                                    {swatch && (
                                      <button
                                        type="button"
                                        onClick={() => setSwatch(option.name, v, null)}
                                        style={{
                                          padding: "4px 0",
                                          border: "none", background: "transparent", cursor: "pointer",
                                          fontSize: 11, color: "tomato", textAlign: "center",
                                        }}
                                      >Entfernen</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </InlineStack>
                            );
                          })}
                        </BlockStack>
                      </div>

                      {translationLocales.length > 0 && (
                        !option.id ? (
                          <Text variant="bodyXs" tone="subdued">Erst speichern, um Übersetzungen zu bearbeiten</Text>
                        ) : !optionTranslationData[option.id] ? (
                          <Text variant="bodyXs" tone="subdued">Lade…</Text>
                        ) : (
                          translationLocales.map((loc) => {
                            const nameEntry = optionTranslationData[option.id];
                            const nameDk = `${option.id}:${loc.locale}`;
                            const nameExisting = nameEntry?.translations?.[loc.locale] ?? "";
                            const autoKey = `${oi}:${loc.locale}`;
                            return (
                              <BlockStack key={loc.locale} gap="100">
                                <InlineStack gap="100" blockAlign="center" wrap={false}>
                                  <span style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                                    <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
                                  </span>
                                  <div style={{ width: 100 }}>
                                    <TextField
                                      label="" labelHidden
                                      disabled={!nameEntry?.digest}
                                      placeholder={option.name || "Optionsname"}
                                      value={optionTranslationDrafts[nameDk] ?? nameExisting}
                                      onChange={(val) => setOptionTranslationDrafts((prev) => ({ ...prev, [nameDk]: val }))}
                                      onBlur={() => saveOptionTranslation(option.id, loc.locale)}
                                      autoComplete="off"
                                    />
                                  </div>
                                  <div style={{ flex: 1 }} />
                                  <Button
                                    size="micro"
                                    icon={GlobeIcon}
                                    disabled={autoTranslatingOptionKey === autoKey}
                                    onClick={() => handleAutoTranslateOption(oi, option, loc.locale)}
                                  >
                                    {autoTranslatingOptionKey === autoKey ? "Übersetze…" : "Übersetzen"}
                                  </Button>
                                </InlineStack>

                                <div style={{ paddingLeft: 24 }}>
                                  <InlineStack gap="100" blockAlign="center" wrap>
                                    {(option.values ?? []).map((v) => {
                                    const vid = valueIdFor(option, v);
                                    if (!vid) return null;
                                    const vEntry = optionTranslationData[vid];
                                    const vDk = `${vid}:${loc.locale}`;
                                    const vExisting = vEntry?.translations?.[loc.locale] ?? "";
                                    return (
                                      <div key={vid} style={{ width: 64 }}>
                                        <TextField
                                          label="" labelHidden
                                          disabled={!vEntry?.digest}
                                          placeholder={v}
                                          value={optionTranslationDrafts[vDk] ?? vExisting}
                                          onChange={(val) => setOptionTranslationDrafts((prev) => ({ ...prev, [vDk]: val }))}
                                          onBlur={() => saveOptionTranslation(vid, loc.locale)}
                                          autoComplete="off"
                                        />
                                      </div>
                                    );
                                    })}
                                  </InlineStack>
                                </div>
                              </BlockStack>
                            );
                          })
                        )
                      )}

                      <InlineStack align="end">
                        <Button size="slim" onClick={() => setEditingOptionName((prev) => ({ ...prev, [oi]: false }))}>Fertig</Button>
                      </InlineStack>
                    </div>
                  )}

                  {/* Pills + + Button */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {(option.values ?? []).map((value, valueIndex) => {
                      const pillSwatch = optionSwatches[option.name]?.[value];
                      return (
                        <span
                          key={`${option.id ?? oi}-${value}-${valueIndex}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 0,
                            borderRadius: 999,
                            border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                            background: isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)",
                            fontSize: 12, lineHeight: 1, overflow: "hidden",
                          }}
                        >
                          {pillSwatch && (
                            <span style={{
                              width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginLeft: 4,
                              border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                              background: pillSwatch.color ? pillSwatch.color : `url(${pillSwatch.imageUrl}) center/cover`,
                            }} />
                          )}
                          {/* Wert-Label */}
                          <span style={{ padding: "5px 8px" }}>{value}</span>

                          {/* Löschen */}
                          <button
                            type="button"
                            onClick={() => {
                              const newValues = option.values.filter((_, j) => j !== valueIndex);
                              if (newValues.length === 0) {
                                setOptionDrafts(optionDrafts.filter((_, i) => i !== oi));
                              } else {
                                const newAbbr = { ...(option.abbreviations ?? {}) };
                                delete newAbbr[value];
                                const updated = [...optionDrafts];
                                updated[oi] = { ...option, values: newValues, abbreviations: newAbbr };
                                setOptionDrafts(updated);
                              }
                            }}
                            style={{
                              border: "none",
                              borderLeft: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                              background: "transparent", cursor: "pointer",
                              padding: "5px 7px", color: "var(--p-color-text-subdued)",
                              lineHeight: 1,
                            }}
                            aria-label={`Wert ${value} entfernen`}
                          >✕</button>
                        </span>
                      );
                    })}

                    {/* + Button direkt nach Pills */}
                    {openNewValue[oi] ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        border: "1px dashed var(--p-color-border)", borderRadius: 999,
                        padding: "3px 6px", background: "var(--p-color-bg-surface)",
                      }}>
                        <input
                          className="rexpaw-inline-input"
                          value={newOptionValues[oi] ?? ""}
                          onChange={(e) => setNewOptionValues((prev) => ({ ...prev, [oi]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addValue(oi, option);
                            if (e.key === "Escape") setOpenNewValue((prev) => ({ ...prev, [oi]: false }));
                          }}
                          style={{
                            border: "none", outline: "none",
                            appearance: "none", borderRadius: 0,
                            fontSize: 12, width: 80, color: "var(--p-color-text)",
                          }}
                          placeholder="Wert..."
                        />
                        <button
                          type="button"
                          onClick={() => addValue(oi, option)}
                          style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 12, color: "var(--p-color-text-secondary)" }}
                        >✓</button>
                      </span>
                    ) : (
                      <Button size="micro" onClick={() => setOpenNewValue((prev) => ({ ...prev, [oi]: true }))}>+</Button>
                    )}
                  </div>

                </div>
              ))}
            </div>
          )}

          <InlineStack gap="300" blockAlign="center" wrap>
            <Button
              size="slim"
              disabled={(optionDrafts?.length ?? 0) >= 2}
              onClick={() => setOptionDrafts((prev) => [...prev, { name: "", values: [] }])}
            >
              + Neue Option
            </Button>
          </InlineStack>
        </BlockStack>
    </>
  );
}
