import { useState } from "react";
import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import LocaleFlag from "../../shared/LocaleFlag.jsx";
import { useColorScheme } from "../../../context/ColorSchemeContext";

// Während des Tippens NICHT den Bindestrich am Ende abschneiden - sonst verschwindet er sofort
// wieder, sobald man ihn tippt (onChange feuert nach jedem Zeichen). Nur ungültige Zeichen
// werden live normalisiert, das finale Trimmen passiert erst beim Speichern.
function normalizeHandleInput(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");
}

function slugifyHandle(value) {
  return normalizeHandleInput(value)
    .trim()
    .replace(/^-|-$/g, "");
}

function getProductPreviewUrl(shop, handle) {
  const safeHandle = handle || "product-handle";
  return shop ? `https://${shop}/products/${safeHandle}` : `/products/${safeHandle}`;
}

export default function ProductDetailSeo({ product, fetcher, shop, setToast, renderTranslationRows, primaryLocale, translatedLocales = [] }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const fieldBox = {
    border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`, borderRadius: 8, padding: 10,
    background: isDark ? "rgba(255,255,255,0.2)" : "var(--p-color-bg-surface-secondary)",
  };
  const [editing, setEditing] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [seoDraft, setSeoDraft] = useState({
    seoTitle: product.seo?.title ?? product.title ?? "",
    seoDescription: product.seo?.description ?? "",
    handle: product.handle ?? "",
  });
  const [seoDirty, setSeoDirty] = useState(false);

  const previewUrl = getProductPreviewUrl(shop, seoDraft.handle);

  const handleSave = () => {
    fetcher.submit(
      {
        action: "updateSeo",
        id: product.id,
        handle: slugifyHandle(seoDraft.handle),
        seoTitle: seoDraft.seoTitle,
        seoDescription: seoDraft.seoDescription,
      },
      { method: "POST" }
    );
    setEditing(false);
    setSeoDirty(false);
    setToast?.("SEO gespeichert");
  };

  const handleCancel = () => {
    setEditing(false);
    setSeoDirty(false);
  };

  const isSeoSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateSeo";

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="100" blockAlign="center">
            <Text variant="headingSm">SEO</Text>
            {translatedLocales.map((loc) => (
              <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                <LocaleFlag locale={loc.locale} round size={12} />
              </span>
            ))}
          </InlineStack>
          {!editing && (
            <Button size="slim" onClick={() => setEditing(true)}>Bearbeiten</Button>
          )}
        </InlineStack>
        <Divider />

        {editing && (
          <BlockStack gap="300">
            <div style={fieldBox}>
              <BlockStack gap="100">
                <InlineStack align="space-between">
                  <Text variant="bodyXs" tone="subdued" as="p">SEO Titel · Empfohlen: bis 60 Zeichen</Text>
                  <Text variant="bodyXs" tone="subdued" as="p">{seoDraft.seoTitle.length}/70</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="center" wrap={false}>
                  {primaryLocale && (
                    <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <LocaleFlag locale={primaryLocale} size={20} round />
                    </span>
                  )}
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="" labelHidden
                      value={seoDraft.seoTitle}
                      onChange={(value) => { setSeoDraft((prev) => ({ ...prev, seoTitle: value })); setSeoDirty(true); }}
                      autoComplete="off"
                      maxLength={70}
                    />
                  </div>
                </InlineStack>
                {renderTranslationRows?.("meta_title", { fallback: seoDraft.seoTitle })}
              </BlockStack>
            </div>

            <div style={fieldBox}>
              <BlockStack gap="100">
                <Text variant="bodyXs" tone="subdued" as="p">URL Handle · Nur Kleinbuchstaben, Zahlen und Bindestriche</Text>
                <InlineStack gap="100" blockAlign="center" wrap={false}>
                  {primaryLocale && (
                    <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <LocaleFlag locale={primaryLocale} size={20} round />
                    </span>
                  )}
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="" labelHidden
                      value={seoDraft.handle}
                      onChange={(value) => { setSeoDraft((prev) => ({ ...prev, handle: normalizeHandleInput(value) })); setSeoDirty(true); }}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
                {renderTranslationRows?.("handle")}
              </BlockStack>
            </div>

            <div style={fieldBox}>
              <BlockStack gap="100">
                <InlineStack align="space-between">
                  <Text variant="bodyXs" tone="subdued" as="p">Meta Description · Empfohlen: bis 155 Zeichen</Text>
                  <Text variant="bodyXs" tone="subdued" as="p">{seoDraft.seoDescription.length}/160</Text>
                </InlineStack>
                <InlineStack gap="100" blockAlign="start" wrap={false}>
                  {primaryLocale && (
                    <span style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: 6 }}>
                      <LocaleFlag locale={primaryLocale} size={20} round />
                    </span>
                  )}
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="" labelHidden
                      value={seoDraft.seoDescription}
                      onChange={(value) => { setSeoDraft((prev) => ({ ...prev, seoDescription: value })); setSeoDirty(true); }}
                      autoComplete="off"
                      multiline={3}
                      maxLength={160}
                    />
                  </div>
                </InlineStack>
                {renderTranslationRows?.("meta_description", { multiline: true, fallback: seoDraft.seoDescription })}
              </BlockStack>
            </div>

            <InlineStack gap="200" align="end">
              <Button size="slim" onClick={handleCancel}>Abbrechen</Button>
              <Button variant="primary" size="slim" loading={isSeoSaving} disabled={!seoDirty} onClick={handleSave}>
                Speichern
              </Button>
            </InlineStack>
          </BlockStack>
        )}

        <BlockStack gap="050">
          <Text variant="bodySm" tone="subdued">Live Vorschau</Text>
          <Text variant="bodySm" tone="subdued">
            <span style={{ wordBreak: "break-word" }}>{previewUrl}</span>
          </Text>
          <Text variant="headingSm">{seoDraft.seoTitle || product.title}</Text>
          {(() => {
            const previewText = seoDraft.seoDescription || product.description || "Keine Meta Description hinterlegt.";
            return (
              <>
                <div
                  style={previewExpanded ? {} : {
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }}
                >
                  <Text variant="bodySm" tone="subdued">{previewText}</Text>
                </div>
                <Button variant="plain" size="micro" onClick={() => setPreviewExpanded((v) => !v)}>
                  {previewExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
                </Button>
              </>
            );
          })()}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}
