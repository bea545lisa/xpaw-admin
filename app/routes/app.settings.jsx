import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { getSkuFormat, getSkuAbbreviations, setSetting } from "../services/settings.server";
import { DEFAULT_SKU_FORMAT } from "../utils/skuFormat.js";
import {
  Card, BlockStack, Text, InlineStack, Button, TextField,
  Divider, Badge, Select, Toast,
} from "@shopify/polaris";
import { SettingsIcon, PlusIcon } from "@shopify/polaris-icons";
import { useState, useEffect } from "react";
import { useColorScheme } from "../context/ColorSchemeContext";
import { buildSkuValidator } from "../utils/skuFormat.js";

// ─── Vorbelegte Kürzel-Matrix ─────────────────────────────────────────────────

const DEFAULT_ABBREVIATIONS = [
  // Größen
  { value: "XS",   abbr: "xs",  group: "Größen" },
  { value: "S",    abbr: "s",   group: "Größen" },
  { value: "M",    abbr: "m",   group: "Größen" },
  { value: "L",    abbr: "l",   group: "Größen" },
  { value: "XL",   abbr: "xl",  group: "Größen" },
  { value: "XXL",  abbr: "xxl", group: "Größen" },
  // Farben
  { value: "Schwarz",  abbr: "sw",  group: "Farben" },
  { value: "Weiß",     abbr: "ws",  group: "Farben" },
  { value: "Grau",     abbr: "gr",  group: "Farben" },
  { value: "Rot",      abbr: "ro",  group: "Farben" },
  { value: "Blau",     abbr: "bl",  group: "Farben" },
  { value: "Grün",     abbr: "gn",  group: "Farben" },
  { value: "Gelb",     abbr: "ge",  group: "Farben" },
  { value: "Orange",   abbr: "or",  group: "Farben" },
  { value: "Pink",     abbr: "pk",  group: "Farben" },
  { value: "Lila",     abbr: "li",  group: "Farben" },
  { value: "Braun",    abbr: "br",  group: "Farben" },
  { value: "Beige",    abbr: "bg",  group: "Farben" },
  { value: "Navy",     abbr: "nv",  group: "Farben" },
  { value: "Gold",     abbr: "go",  group: "Farben" },
  { value: "Silber",   abbr: "si",  group: "Farben" },
];

// Konvertiert gespeichertes Objekt { Blau: "bl" } → Row-Array
function mapToRows(map) {
  return Object.entries(map).map(([value, abbr]) => ({ value, abbr }));
}

// Konvertiert Row-Array → Objekt
function rowsToMap(rows) {
  return Object.fromEntries(
    rows.filter((r) => r.value.trim()).map((r) => [r.value.trim(), r.abbr.trim()])
  );
}

// ─── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const [skuFormat, skuAbbreviations] = await Promise.all([
    getSkuFormat(session.shop),
    getSkuAbbreviations(session.shop),
  ]);
  return { skuFormat, skuAbbreviations, shop: session.shop };
};

// ─── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("action");

  if (type === "saveSkuFormat") {
    await setSetting(session.shop, "sku_format", {
      enabled:     formData.get("enabled") !== "false",
      separator:   formData.get("separator")   || "-",
      customRegex: formData.get("customRegex") || "",
      example:     formData.get("example")     || "",
    });
    return Response.json({ ok: true, saved: "format" });
  }

  if (type === "saveSkuAbbreviations") {
    const map = JSON.parse(formData.get("abbreviations") || "{}");
    await setSetting(session.shop, "sku_abbreviations", map);
    return Response.json({ ok: true, saved: "abbreviations" });
  }

  return Response.json({ ok: false });
};

// ─── Hilfkomponente: editierbare Zeile ───────────────────────────────────────

const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "4px 8px", fontSize: 12,
  border: "1px solid var(--p-color-border)",
  borderRadius: 6, background: "var(--p-color-bg-surface)",
  color: "var(--p-color-text)", outline: "none",
  height: 28,
};

function AbbreviationRow({ row, onChange, onDelete }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 24px", gap: 6, alignItems: "center" }}>
      <input
        value={row.value}
        onChange={(e) => onChange({ ...row, value: e.target.value })}
        placeholder="Optionswert (z. B. Blau)"
        autoComplete="off"
        style={inputStyle}
      />
      <input
        value={row.abbr}
        onChange={(e) => onChange({ ...row, abbr: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) })}
        placeholder="Kürzel"
        autoComplete="off"
        style={{ ...inputStyle, fontFamily: "monospace", fontWeight: 600 }}
      />
      <button
        type="button"
        onClick={onDelete}
        style={{
          background: "transparent", border: "none",
          cursor: "pointer", padding: 0,
          color: "var(--p-color-text-subdued)",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 24, height: 24,
        }}
        title="Zeile entfernen"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { skuFormat: savedFormat, skuAbbreviations: savedAbbreviations } = useLoaderData();
  const fetcher = useFetcher();

  // ── SKU-Format ──
  const [fmt, setFmt] = useState({ ...DEFAULT_SKU_FORMAT, ...savedFormat });
  const set = (key) => (val) => setFmt((f) => ({ ...f, [key]: val }));

  // ── Kürzel-Matrix ──
  const initRows = savedAbbreviations
    ? mapToRows(savedAbbreviations)
    : DEFAULT_ABBREVIATIONS.map(({ value, abbr }) => ({ value, abbr }));
  const [rows, setRows] = useState(initRows);

  // ── Toast ──
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    if (fetcher.data?.ok) {
      setToastMsg(
        fetcher.data.saved === "abbreviations"
          ? "Kürzel-Matrix gespeichert"
          : "SKU-Format gespeichert"
      );
      setTimeout(() => setToastMsg(null), 2500);
    }
  }, [fetcher.data]);

  // ── Format speichern ──
  const handleSaveFormat = () => {
    fetcher.submit(
      { action: "saveSkuFormat", ...fmt, enabled: String(fmt.enabled ?? true) },
      { method: "post", action: "/app/settings" },
    );
  };

  // ── Kürzel speichern ──
  const handleSaveAbbreviations = () => {
    fetcher.submit(
      { action: "saveSkuAbbreviations", abbreviations: JSON.stringify(rowsToMap(rows)) },
      { method: "post", action: "/app/settings" },
    );
  };

  const updateRow = (i, updated) => setRows((r) => r.map((row, j) => j === i ? updated : row));
  const deleteRow = (i) => setRows((r) => r.filter((_, j) => j !== i));
  const addRow = () => setRows((r) => [...r, { value: "", abbr: "" }]);

  // ── Format-Vorschau ──
  const validator = buildSkuValidator(fmt);
  const previewSku = fmt.example || "12345-bl-m";
  const previewError = validator(previewSku);
  const previewOk = previewSku && !previewError;

  const separatorOptions = [
    { label: "Bindestrich  —  12345-bl-m", value: "-" },
    { label: "Unterstrich  —  12345_bl_m", value: "_" },
    { label: "Punkt  —  12345.bl.m",       value: "." },
    { label: "Schrägstrich  —  12345/bl/m", value: "/" },
  ];

  // Gruppen für Vorschau (alle Zeilen, nach Duplikaten gruppiert)
  const groups = rows.reduce((acc, row) => {
    if (!row.value.trim()) return acc;
    acc.push(row);
    return acc;
  }, []);

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
        <span style={{ display: "flex", fill: isDark ? "#f3f4f6" : "#555", opacity: isDark ? 1 : 0.5 }}>
          <SettingsIcon width={20} height={20} />
        </span>
        <Text variant="headingLg" as="h1">Einstellungen</Text>
      </div>

      {toastMsg && <Toast content={toastMsg} onDismiss={() => setToastMsg(null)} />}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, alignItems: "start" }}>

        {/* ── SKU-Format ── */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingSm">SKU-Format</Text>
              <Text tone="subdued" variant="bodySm">
                Legt fest, wie SKUs aufgebaut sein sollen. Beim Bearbeiten einer SKU im
                Produktdetail erscheint eine Warnung, wenn das Format nicht eingehalten wird.
              </Text>
            </BlockStack>

            <Divider />

            {/* Aktivierungs-Checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={fmt.enabled ?? true}
                onChange={(e) => setFmt((f) => ({ ...f, enabled: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--p-color-bg-fill-brand)" }}
              />
              <BlockStack gap="0">
                <Text variant="bodySm" fontWeight="semibold">Format-Prüfung aktiv</Text>
                <Text variant="bodySm" tone="subdued">
                  Wenn deaktiviert, werden alle SKUs ohne Warnung akzeptiert.
                </Text>
              </BlockStack>
            </label>

            {/* Erklärung + restliche Felder – ausgegraut wenn deaktiviert */}
            <div style={{ opacity: fmt.enabled === false ? 0.4 : 1, pointerEvents: fmt.enabled === false ? "none" : "auto" }}>
            <div style={{
              padding: "10px 12px", borderRadius: 8,
              background: "var(--p-color-bg-surface-secondary)",
              fontSize: 13, lineHeight: 1.6,
            }}>
              <strong>Wie funktioniert das Format?</strong><br />
              Eine SKU besteht aus Teilen, die durch ein Trennzeichen verbunden sind.<br />
              Beispiel: <code>12345-bl-m</code> hat <strong>3 Teile</strong>: Präfix · Farbe · Größe.<br />
              Produkte <em>ohne</em> Optionen haben nur 1 Teil (nur den Präfix, z. B. <code>12345</code>).<br />
              Produkte mit 1 Option haben 2 Teile, mit 2 Optionen 3 Teile.<br /><br />
              <strong>Wichtig:</strong> Der Präfix ist die Produktnummer und muss bei <em>allen Varianten
              desselben Produkts identisch</em> sein – nur die Optionswerte dahinter unterscheiden sich.<br />
              Beispiel Shirt in Blau/Rot, Größe S/M:{" "}
              <code>12345-bl-s</code> · <code>12345-bl-m</code> · <code>12345-ro-s</code> · <code>12345-ro-m</code><br /><br />
              Das <strong>Präfix-Format</strong> unten prüft nur den ersten Teil – Trennzeichen und
              Optionswerte werden separat gehandhabt.
            </div>

            {/* Separator */}
            <Select
              label="Trennzeichen"
              options={separatorOptions}
              value={fmt.separator}
              onChange={set("separator")}
              helpText="Das Zeichen, das die einzelnen Teile der SKU voneinander trennt."
            />

            {/* Präfix-Format */}
            <BlockStack gap="200">
              <TextField
                label="Erlaubtes Präfix-Format (optional)"
                value={fmt.customRegex}
                onChange={set("customRegex")}
                placeholder="z. B.  ^\d{4,6}$"
                autoComplete="off"
                monospaced
                helpText="Prüft nur den Präfix (ersten Teil vor dem Trennzeichen). Leer lassen = alles erlaubt."
              />

              {/* Beispiele */}
              <div style={{
                borderRadius: 8,
                border: "1px solid var(--p-color-border)",
                overflow: "hidden",
                fontSize: 12,
              }}>
                <div style={{
                  padding: "6px 12px",
                  background: "var(--p-color-bg-surface-secondary)",
                  borderBottom: "1px solid var(--p-color-border)",
                  fontWeight: 600,
                }}>
                  Typische Präfix-Formate:
                </div>
                {[
                  {
                    pattern: "^\\d{4,6}$",
                    desc: "Nur Ziffern, 4–6 Stellen",
                    ok: ["1234", "99999"],
                    bad: ["abc", "12"],
                  },
                  {
                    pattern: "^[A-Z]{2}\\d{3,5}$",
                    desc: "2 Großbuchstaben + 3–5 Ziffern",
                    ok: ["AB123", "XY99999"],
                    bad: ["ab123", "A1234"],
                  },
                  {
                    pattern: "^[a-z0-9]{3,8}$",
                    desc: "Kleinbuchstaben & Ziffern, 3–8 Zeichen",
                    ok: ["abc12", "shirt01"],
                    bad: ["AB", "toolongprefix"],
                  },
                ].map(({ pattern, desc, ok, bad }) => (
                  <div
                    key={pattern}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      padding: "8px 12px",
                      borderBottom: "1px solid var(--p-color-border-subdued)",
                      alignItems: "start",
                    }}
                  >
                    <div>
                      <code style={{ fontFamily: "monospace", fontWeight: 600, fontSize: 12 }}>{pattern}</code>
                      <div style={{ color: "var(--p-color-text-subdued)", margin: "3px 0" }}>{desc}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {ok.map((s) => (
                          <span key={s} style={{ color: isDark ? "#6ee7a8" : "#15803d", background: isDark ? "#1a3a2a" : "#f0fdf4", border: `1px solid ${isDark ? "#2d5a3d" : "#bbf7d0"}`, borderRadius: 4, padding: "1px 6px", fontSize: 12 }}>✓ {s}</span>
                        ))}
                        {bad.map((s) => (
                          <span key={s} style={{ color: isDark ? "#f87171" : "#b91c1c", background: isDark ? "#3a1a1a" : "#fef2f2", border: `1px solid ${isDark ? "#5a2d2d" : "#fecaca"}`, borderRadius: 4, padding: "1px 6px", fontSize: 12 }}>✗ {s}</span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => set("customRegex")(pattern)}
                      style={{
                        flexShrink: 0,
                        padding: "4px 10px",
                        borderRadius: 6,
                        border: "1px solid var(--p-color-border)",
                        background: "var(--p-color-bg-surface)",
                        cursor: "pointer",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Übernehmen
                    </button>
                  </div>
                ))}
              </div>
            </BlockStack>

            {/* Beispiel-SKU */}
            <TextField
              label="Beispiel-SKU"
              value={fmt.example}
              onChange={set("example")}
              placeholder="12345-bl-m"
              autoComplete="off"
              helpText="Wird in Warnmeldungen als Beispiel angezeigt."
            />

            {/* Live-Vorschau */}
            <div style={{
              padding: "12px 14px", borderRadius: 8,
              background: "var(--p-color-bg-surface-secondary)",
              border: "1px solid",
              borderColor: previewError
                ? "var(--p-color-border-caution)"
                : "var(--p-color-border)",
            }}>
              <InlineStack gap="200" blockAlign="center">
                <Text variant="bodySm" fontWeight="semibold">Vorschau der Beispiel-SKU:</Text>
                <code style={{ fontSize: 13 }}>{previewSku}</code>
                {previewOk
                  ? <Badge tone="info">✓ gültig</Badge>
                  : previewError ? <Badge tone="critical">⚠ {previewError}</Badge>
                  : null}
              </InlineStack>
              <div style={{ marginTop: 6 }}>
                <Text variant="bodySm" tone="subdued">
                  Teile: {previewSku.split(fmt.separator || "-").join(" · ")}
                </Text>
              </div>
            </div>

            </div>{/* Ende ausgegraut-Wrapper */}

            <InlineStack gap="200">
              <Button
                variant="primary"
                onClick={handleSaveFormat}
                loading={fetcher.state !== "idle" && fetcher.formData?.get("action") === "saveSkuFormat"}
              >
                Format speichern
              </Button>
              <Button onClick={() => setFmt({ ...DEFAULT_SKU_FORMAT })}>Zurücksetzen</Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {/* ── Kürzel-Matrix ── */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text variant="headingSm">Kürzel-Matrix</Text>
              <Text tone="subdued" variant="bodySm">
                Definiert, welches Kürzel für einen Optionswert in der SKU verwendet wird.
                Gilt für alle Produkte im Shop. Produktspezifische Kürzel (direkt am Produkt
                definiert) haben Vorrang.
              </Text>
            </BlockStack>

            <Divider />

            {/* Spalten-Header */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 24px", gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Optionswert</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--p-color-text-subdued)" }}>Kürzel</span>
              <div />
            </div>

            {/* Zeilen */}
            <BlockStack gap="200">
              {rows.map((row, i) => (
                <AbbreviationRow
                  key={i}
                  row={row}
                  onChange={(updated) => updateRow(i, updated)}
                  onDelete={() => deleteRow(i)}
                />
              ))}
            </BlockStack>

            <InlineStack gap="300" blockAlign="center">
              <Button icon={PlusIcon} size="slim" onClick={addRow}>
                Zeile hinzufügen
              </Button>
              <Button
                size="slim"
                variant="plain"
                onClick={() => setRows(DEFAULT_ABBREVIATIONS.map(({ value, abbr }) => ({ value, abbr })))}
              >
                Standardwerte wiederherstellen
              </Button>
            </InlineStack>

            {/* Kompakt-Vorschau der aktuellen Map */}
            {groups.length > 0 && (
              <div style={{
                padding: "10px 12px", borderRadius: 8,
                background: "var(--p-color-bg-surface-secondary)",
              }}>
                <Text variant="bodySm" tone="subdued" fontWeight="semibold">Vorschau:</Text>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {groups.map((row, i) => (
                    <span key={i} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "3px 8px", borderRadius: 999,
                      border: "1px solid var(--p-color-border)",
                      background: "var(--p-color-bg-surface)",
                      fontSize: 12,
                    }}>
                      {row.value}
                      <span style={{ fontFamily: "monospace", fontWeight: 600, color: "var(--p-color-text-emphasis)" }}>
                        → {row.abbr || "???"}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <InlineStack gap="200">
              <Button
                variant="primary"
                onClick={handleSaveAbbreviations}
                loading={fetcher.state !== "idle" && fetcher.formData?.get("action") === "saveSkuAbbreviations"}
              >
                Kürzel speichern
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

      </div>
    </div>
  );
}
