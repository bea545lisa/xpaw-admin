import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import {useEffect, useRef, useState} from "react";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";

export default function ProductDetailOptions({
  optionDrafts, setOptionDrafts, optionsDirty, handleOptionsSave,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const [newOptionValues, setNewOptionValues] = useState({});
  const [openNewValue, setOpenNewValue] = useState({});
  const [editingOptionName, setEditingOptionName] = useState({});
  const optionNameRefs = useRef({});
  const newValueRefs = useRef({});

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
      <Card>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {optionDrafts.map((option, oi) => (
                <div
                  key={option.id ?? oi}
                  style={{
                    padding: 8,
                    border: "1px solid var(--p-color-border-subdued)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {/* Optionsname: readonly + Edit-Button */}
                  <InlineStack align="space-between" blockAlign="center" gap="200">
                    {editingOptionName[oi] ? (
                      <div
                        style={{ flex: 1 }}
                        ref={(el) => {
                          if (el) setTimeout(() => el.querySelector("input")?.focus(), 0);
                        }}
                      >
                        <TextField
                          label="" labelHidden autoComplete="off"
                          placeholder="z.B. Größe"
                          value={option.name}
                          onChange={(val) => {
                            const updated = [...optionDrafts];
                            updated[oi] = { ...option, name: val };
                            setOptionDrafts(updated);
                          }}
                          onBlur={() => setEditingOptionName((prev) => ({ ...prev, [oi]: false }))}
                        />
                      </div>
                    ) : (
                      <Text variant="bodySm" fontWeight="semibold">
                        {option.name || <span style={{ color: "var(--p-color-text-subdued)" }}>Name...</span>}
                      </Text>
                    )}
                    <Button
                      size="micro"
                      variant="plain"
                      onClick={() => setEditingOptionName((prev) => ({ ...prev, [oi]: true }))}
                    >
                      ✎
                    </Button>
                  </InlineStack>

                  {/* Pills + + Button */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {(option.values ?? []).map((value, valueIndex) => {
                      const abbr = option.abbreviations?.[value] ?? "";
                      return (
                        <span
                          key={`${option.id ?? oi}-${value}-${valueIndex}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 0,
                            borderRadius: 999,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface-secondary)",
                            fontSize: 12, lineHeight: 1, overflow: "hidden",
                          }}
                        >
                          {/* Wert-Label */}
                          <span style={{ padding: "5px 8px" }}>{value}</span>

                          {/* Kürzel-Badge – inline editierbar */}
                          <span
                            title="SKU-Kürzel (klicken zum Bearbeiten)"
                            style={{
                              borderLeft: "1px solid var(--p-color-border)",
                              padding: "5px 6px",
                              background: "transparent",
                              outline: `1.5px dashed ${isDark ? "#666" : "#9ca3af"}`,
                              outlineOffset: "-2px",
                              borderRadius: 2,
                              display: "inline-flex", alignItems: "center",
                            }}
                          >
                            <input
                              value={abbr}
                              onChange={(e) => {
                                const updated = [...optionDrafts];
                                updated[oi] = {
                                  ...option,
                                  abbreviations: { ...(option.abbreviations ?? {}), [value]: e.target.value },
                                };
                                setOptionDrafts(updated);
                              }}
                              style={{
                                border: "none", outline: "none",
                                background: "transparent",
                                fontSize: 11, fontFamily: "monospace",
                                width: Math.max(24, abbr.length * 8 + 8),
                                color: isDark ? "#e5e7eb" : "#111",
                                fontWeight: 400,
                              }}
                              title="SKU-Kürzel"
                              placeholder="???"
                            />
                          </span>

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
                              borderLeft: "1px solid var(--p-color-border)",
                              background: "transparent", cursor: "pointer",
                              padding: "5px 7px", color: "var(--p-color-text-subdued)",
                              lineHeight: 1, border: "none",
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
                          value={newOptionValues[oi] ?? ""}
                          onChange={(e) => setNewOptionValues((prev) => ({ ...prev, [oi]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addValue(oi, option);
                            if (e.key === "Escape") setOpenNewValue((prev) => ({ ...prev, [oi]: false }));
                          }}
                          style={{
                            border: "none", outline: "none", background: "transparent",
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
            {optionDrafts.length > 0 && (
              <Text variant="bodySm" tone="subdued">
                Das gestrichelt umrahmte Kürzel pro Wert wird für die automatische SKU-Generierung verwendet (z.&nbsp;B. Blau → <code>bl</code>).
              </Text>
            )}
          </InlineStack>
        </BlockStack>
      </Card>

    </>
  );
}
