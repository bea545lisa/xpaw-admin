import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import { useState } from "react";
import LocaleFlag from "../../shared/LocaleFlag.jsx";

export default function ProductDetailDescription({ product, fetcher, productId, setToast, renderTranslationRows, primaryLocale, translatedLocales = [] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product.description ?? "");

  const handleSave = () => {
    fetcher.submit(
      { action: "updateDescription", id: productId, description: draft },
      { method: "POST" }
    );
    setEditing(false);
    setToast?.("Beschreibung gespeichert");
  };

  return (
    <Card>
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="100" blockAlign="center">
            <Text variant="headingSm">Beschreibung</Text>
            {translatedLocales.map((loc) => (
              <span key={loc.locale} title={`Übersetzung vorhanden (${loc.name})`}>
                <LocaleFlag locale={loc.locale} round size={12} />
              </span>
            ))}
          </InlineStack>
          {!editing && (
            <Button
              size="micro"
              onClick={() => { setDraft(product.description ?? ""); setEditing(true); }}
            >
              Bearbeiten
            </Button>
          )}
        </InlineStack>
        <Divider />

        {editing ? (
          <BlockStack gap="150">
            <InlineStack gap="100" blockAlign="start" wrap={false}>
              {primaryLocale && (
                <div style={{ width: 24, flexShrink: 0, display: "flex", justifyContent: "flex-start", paddingTop: 6 }}>
                  <LocaleFlag locale={primaryLocale} size={20} round />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <TextField
                  label="" labelHidden
                  value={draft}
                  onChange={setDraft}
                  multiline={5}
                  autoComplete="off"
                />
              </div>
            </InlineStack>

            {renderTranslationRows?.("body_html", { multiline: true, fallback: draft })}

            <InlineStack gap="200" align="end">
              <Button size="slim" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
              <Button variant="primary" size="slim" onClick={handleSave}>
                Speichern
              </Button>
            </InlineStack>
          </BlockStack>
        ) : (
          <Text tone="subdued">
            {product.description || <em>Keine Beschreibung</em>}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
