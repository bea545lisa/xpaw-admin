import { useState } from "react";
import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";

function slugifyHandle(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getProductPreviewUrl(shop, handle) {
  const safeHandle = handle || "product-handle";
  return shop ? `https://${shop}/products/${safeHandle}` : `/products/${safeHandle}`;
}

export default function ProductDetailSeo({ product, fetcher, shop, setToast }) {
  const [editing, setEditing] = useState(false);
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
        handle: seoDraft.handle,
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
          <Text variant="headingSm">SEO</Text>
          {!editing && (
            <Button size="slim" onClick={() => setEditing(true)}>Bearbeiten</Button>
          )}
        </InlineStack>
        <Divider />

        {editing && (
          <BlockStack gap="300">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <TextField
                label="SEO Titel"
                value={seoDraft.seoTitle}
                onChange={(value) => { setSeoDraft((prev) => ({ ...prev, seoTitle: value })); setSeoDirty(true); }}
                autoComplete="off"
                maxLength={70}
                showCharacterCount
                helpText="Empfohlen: bis 60 Zeichen"
              />
              <TextField
                label="URL Handle"
                value={seoDraft.handle}
                onChange={(value) => { setSeoDraft((prev) => ({ ...prev, handle: slugifyHandle(value) })); setSeoDirty(true); }}
                autoComplete="off"
                helpText="Nur Kleinbuchstaben, Zahlen und Bindestriche"
              />
            </div>
            <TextField
              label="Meta Description"
              value={seoDraft.seoDescription}
              onChange={(value) => { setSeoDraft((prev) => ({ ...prev, seoDescription: value })); setSeoDirty(true); }}
              autoComplete="off"
              multiline={3}
              maxLength={160}
              showCharacterCount
              helpText="Empfohlen: bis 155 Zeichen"
            />
            <InlineStack gap="200" align="end">
              <Button size="slim" onClick={handleCancel}>Abbrechen</Button>
              <Button variant="primary" size="slim" loading={isSeoSaving} disabled={!seoDirty} onClick={handleSave}>
                Speichern
              </Button>
            </InlineStack>
          </BlockStack>
        )}

        <div style={{
          border: "1px solid var(--p-color-border-subdued)",
          borderRadius: 8,
          background: "var(--p-color-bg-surface-secondary)",
          padding: 16,
        }}>
          <Text variant="bodySm" tone="subdued">Live Vorschau</Text>
          <BlockStack gap="050">
            <Text variant="bodySm" tone="subdued">
              <span style={{ wordBreak: "break-word" }}>{previewUrl}</span>
            </Text>
            <Text variant="headingSm">{seoDraft.seoTitle || product.title}</Text>
            <Text variant="bodySm" tone="subdued">
              {seoDraft.seoDescription || product.description || "Keine Meta Description hinterlegt."}
            </Text>
          </BlockStack>
        </div>
      </BlockStack>
    </Card>
  );
}
