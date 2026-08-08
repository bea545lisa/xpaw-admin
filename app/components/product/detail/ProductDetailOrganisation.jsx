import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import { GlobeIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import { useProductCollections } from "../../../hooks/useProductCollections.js";
import { useProductTags } from "../../../hooks/useProductTags.js";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";
import LocaleFlag from "../../shared/LocaleFlag.jsx";

export default function ProductDetailOrganisation({ product, allCollections, allTags, fetcher, setToast, locales = [] }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const collections = useProductCollections({ initialCollections: product.collections?.edges?.map(e => e.node) ?? [], allCollections, fetcher, productId: product.id });
  const tags = useProductTags({ initialTags: product.tags ?? [], allTags, fetcher, productId: product.id });

  const tagInputRef = useRef(null);
  const collectionInputRef = useRef(null);

  // ── Collection-Pill: deutschen Titel umbenennen ──
  const renameCollectionFetcher = useFetcher();
  const [collectionTitleDrafts, setCollectionTitleDrafts] = useState({}); // { [id]: draftTitle }

  const saveCollectionTitle = (c) => {
    const draft = (collectionTitleDrafts[c.id] ?? c.title).trim();
    if (!draft || draft === c.title) return;
    renameCollectionFetcher.submit({ action: "updateCollectionTitle", id: c.id, title: draft }, { method: "POST" });
  };

  useEffect(() => {
    if (renameCollectionFetcher.state !== "idle" || renameCollectionFetcher.data?.type !== "updateCollectionTitle") return;
    const d = renameCollectionFetcher.data;
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    collections.setLocalCollections((prev) => prev.map((c) => c.id === d.id ? { ...c, title: d.title } : c));
    setCollectionTitleDrafts((prev) => { const n = { ...prev }; delete n[d.id]; return n; });
    setToast?.("Kollektion umbenannt");
  }, [renameCollectionFetcher.state, renameCollectionFetcher.data]);

  // ── Collection-Pill: Titel-Übersetzung ──
  const translationLocales = locales.filter((l) => !l.primary);
  const primaryLocale = locales.find((l) => l.primary)?.locale;
  const pillTranslationFetcher = useFetcher();
  const savePillTranslationFetcher = useFetcher();
  const autoTranslatePillFetcher = useFetcher();
  const [openPillTranslation, setOpenPillTranslation] = useState(null); // collection id oder null
  const [pillTranslationData, setPillTranslationData] = useState({}); // { [id]: { digest, translations: { locale: value } } }
  const [pillTranslationDrafts, setPillTranslationDrafts] = useState({}); // `${id}:${locale}` -> value
  const [autoTranslatingPillKey, setAutoTranslatingPillKey] = useState(null); // `${id}:${locale}`

  const togglePillTranslation = (c) => {
    const willOpen = openPillTranslation !== c.id;
    setOpenPillTranslation(willOpen ? c.id : null);
    if (!willOpen || pillTranslationData[c.id] || translationLocales.length === 0) return;
    pillTranslationFetcher.submit(
      { action: "getCollectionPillTranslation", id: c.id, locales: JSON.stringify(translationLocales.map((l) => l.locale)) },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (pillTranslationFetcher.state !== "idle" || pillTranslationFetcher.data?.type !== "getCollectionPillTranslation") return;
    const d = pillTranslationFetcher.data;
    setPillTranslationData((prev) => ({ ...prev, [d.id]: { digest: d.digest, translations: d.translations } }));
  }, [pillTranslationFetcher.state, pillTranslationFetcher.data]);

  useEffect(() => {
    if (savePillTranslationFetcher.state !== "idle" || savePillTranslationFetcher.data?.type !== "saveCollectionPillTranslation") return;
    const d = savePillTranslationFetcher.data;
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    setPillTranslationData((prev) => {
      const entry = prev[d.id];
      if (!entry) return prev;
      return { ...prev, [d.id]: { ...entry, translations: { ...entry.translations, [d.locale]: d.value } } };
    });
    setToast?.("Übersetzung gespeichert");
  }, [savePillTranslationFetcher.state, savePillTranslationFetcher.data]);

  const savePillTranslation = (id, locale) => {
    const entry = pillTranslationData[id];
    if (!entry?.digest) return;
    const dk = `${id}:${locale}`;
    const value = pillTranslationDrafts[dk] ?? entry.translations[locale] ?? "";
    savePillTranslationFetcher.submit(
      { action: "saveCollectionPillTranslation", id, locale, value, digest: entry.digest },
      { method: "POST" }
    );
  };

  useEffect(() => {
    if (autoTranslatePillFetcher.state !== "idle" || autoTranslatePillFetcher.data?.type !== "autoTranslateCollectionPill") return;
    const d = autoTranslatePillFetcher.data;
    setAutoTranslatingPillKey(null);
    if (!d.ok) { setToast?.(`Fehler: ${d.error}`); return; }
    setPillTranslationData((prev) => {
      const entry = prev[d.id];
      if (!entry) return prev;
      return { ...prev, [d.id]: { ...entry, translations: { ...entry.translations, [d.locale]: d.value } } };
    });
    setPillTranslationDrafts((prev) => {
      const next = { ...prev };
      delete next[`${d.id}:${d.locale}`];
      return next;
    });
    setToast?.("Automatisch übersetzt");
  }, [autoTranslatePillFetcher.state, autoTranslatePillFetcher.data]);

  const handleAutoTranslatePill = (id, locale) => {
    setAutoTranslatingPillKey(`${id}:${locale}`);
    autoTranslatePillFetcher.submit(
      { action: "autoTranslateCollectionPill", id, locale, sourceLocale: primaryLocale ?? "de" },
      { method: "POST" }
    );
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
  const dropdownItem = {
    padding: "8px 12px", cursor: "pointer", fontSize: 13,
    borderBottom: "1px solid var(--p-color-border-subdued)",
  };

  useEffect(() => {
    if (tags.showTagSearch) {
      setTimeout(() => tagInputRef.current?.querySelector("input")?.focus(), 50);
    }
  }, [tags.showTagSearch]);

  useEffect(() => {
    if (collections.showCollectionSearch) {
      setTimeout(() => collectionInputRef.current?.querySelector("input")?.focus(), 50);
    }
  }, [collections.showCollectionSearch]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingSm">Organisation</Text>
        <Divider />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          {/* Collections */}
          <BlockStack gap="200">
            <Text variant="bodySm" fontWeight="semibold">Collections</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {collections.localCollections.map((c) => (
                <span key={c.id} style={{ ...pill, cursor: translationLocales.length > 0 ? "pointer" : "default" }} onClick={() => translationLocales.length > 0 && togglePillTranslation(c)}>
                  {c.title}
                  <button onClick={(e) => { e.stopPropagation(); collections.handleCollectionRemove(c.id); }} style={removeBtn}>✕</button>
                </span>
              ))}
              <Button size="micro" onClick={() => { collections.setShowCollectionSearch(true); collections.setCollectionResults(allCollections); }}>+</Button>
            </div>

            {openPillTranslation && translationLocales.length > 0 && (() => {
              const c = collections.localCollections.find((col) => col.id === openPillTranslation);
              if (!c) return null;
              const entry = pillTranslationData[c.id];
              return (
                <div style={{
                  display: "flex", flexDirection: "column", gap: 8,
                  padding: 10, borderRadius: 8,
                  border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
                  background: isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)",
                }}>
                  <InlineStack gap="100" blockAlign="center" wrap={false}>
                    {primaryLocale && (
                      <span style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                        <LocaleFlag locale={primaryLocale} size={20} round />
                      </span>
                    )}
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="" labelHidden autoComplete="off"
                        value={collectionTitleDrafts[c.id] ?? c.title}
                        onChange={(val) => setCollectionTitleDrafts((prev) => ({ ...prev, [c.id]: val }))}
                        onBlur={() => saveCollectionTitle(c)}
                      />
                    </div>
                    <div style={{ width: 96, flexShrink: 0 }} />
                  </InlineStack>

                  {!entry ? (
                    <Text variant="bodyXs" tone="subdued">Lade…</Text>
                  ) : (
                    translationLocales.map((loc) => {
                      const dk = `${c.id}:${loc.locale}`;
                      const existing = entry.translations?.[loc.locale] ?? "";
                      const autoKey = `${c.id}:${loc.locale}`;
                      return (
                        <InlineStack key={loc.locale} gap="100" blockAlign="center" wrap={false}>
                          <span style={{ width: 20, flexShrink: 0, display: "flex", justifyContent: "flex-start" }}>
                            <LocaleFlag locale={loc.locale} title={loc.name} size={20} round />
                          </span>
                          <div style={{ flex: 1 }}>
                            <TextField
                              label="" labelHidden
                              disabled={!entry.digest}
                              placeholder={entry.digest ? c.title : "Erst auf der Kollektionsseite speichern"}
                              value={pillTranslationDrafts[dk] ?? existing}
                              onChange={(val) => setPillTranslationDrafts((prev) => ({ ...prev, [dk]: val }))}
                              onBlur={() => savePillTranslation(c.id, loc.locale)}
                              autoComplete="off"
                            />
                          </div>
                          <Button
                            size="micro"
                            icon={GlobeIcon}
                            disabled={!entry.digest || autoTranslatingPillKey === autoKey}
                            onClick={() => handleAutoTranslatePill(c.id, loc.locale)}
                          >
                            {autoTranslatingPillKey === autoKey ? "Übersetze…" : "Übersetzen"}
                          </Button>
                        </InlineStack>
                      );
                    })
                  )}

                  <InlineStack align="end">
                    <Button size="slim" onClick={() => setOpenPillTranslation(null)}>Fertig</Button>
                  </InlineStack>
                </div>
              );
            })()}

            {collections.showCollectionSearch && (
              <div style={{ position: "relative" }}>
                <div ref={collectionInputRef}>
                  <TextField
                    label="" labelHidden placeholder="Collection suchen…"
                    value={collections.collectionSearch}
                    onChange={collections.setCollectionSearch}
                    autoComplete="off"
                    onBlur={() => setTimeout(() => collections.setShowCollectionSearch(false), 150)}
                  />
                </div>
                <PositionedDropdown anchorRef={collections.collectionInputRef} open={collections.showCollectionSearch && collections.filteredCollectionSuggestions.length > 0}>
                  {collections.filteredCollectionSuggestions.map((c) => (
                    <div key={c.id} onMouseDown={(e) => { e.preventDefault(); collections.handleCollectionAdd(c); }}
                      style={dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{c.title}</div>
                  ))}
                </PositionedDropdown>
              </div>
            )}
          </BlockStack>

          {/* Tags */}
          <BlockStack gap="200">
            <Text variant="bodySm" fontWeight="semibold">Tags</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {tags.localTags.map((tag) => (
                <span key={tag} style={pill}>
                  {tag}
                  <button onClick={() => tags.handleTagRemove(tag)} style={removeBtn}>✕</button>
                </span>
              ))}
              <Button size="micro" onClick={() => {
                tags.setShowTagSearch(true);
                tags.setShowTagSuggestions(true);
                tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));
              }}>+</Button>
            </div>
            {tags.showTagSearch && (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 8 }} ref={tags.tagInputRef}>
                  <div style={{ flex: 1 }}>
                    <div ref={tagInputRef} style={{ flex: 1 }}>
                      <TextField
                        ref={tagInputRef}
                        label="" labelHidden placeholder="Tag suchen oder eingeben…"
                        value={tags.tagInput}
                        onChange={(val) => {
                          tags.setTagInput(val);
                          tags.setTagSuggestions(
                            allTags.filter(t => !tags.localTags.includes(t) && t.toLowerCase().includes(val.toLowerCase()))
                          );
                        }}
                        autoComplete="off"
                        onFocus={() => {
                          tags.setShowTagSuggestions(true);
                          tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));  // ← hier auch
                        }}
                        onBlur={() => setTimeout(() => { tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); }, 150)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { tags.handleTagAdd(); tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); }
                          if (e.key === "Escape") { tags.setShowTagSearch(false); tags.setShowTagSuggestions(false); }
                        }}
                      />
                    </div>
                  </div>
                  <Button size="micro" onClick={() => {
                    tags.setShowTagSearch(true);
                    tags.setShowTagSuggestions(true);
                    tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));  // ← sofort alle laden
                  }}>+</Button>
                </div>
                <PositionedDropdown anchorRef={tags.tagInputRef}open={tags.showTagSuggestions && tags.tagSuggestions.length > 0}>
                  {tags.tagSuggestions.map((tag) => (
                    <div key={tag}
                      onMouseDown={(e) => { e.preventDefault(); const newTags = [...tags.localTags, tag]; tags.setLocalTags(newTags); tags.setTagInput(""); tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); fetcher.submit({ action: "updateTags", id: product.id, tags: JSON.stringify(newTags) }, { method: "POST" }); }}
                      style={dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{tag}</div>
                  ))}
                </PositionedDropdown>
              </div>
            )}
          </BlockStack>
        </div>
      </BlockStack>
    </Card>
  );
}
