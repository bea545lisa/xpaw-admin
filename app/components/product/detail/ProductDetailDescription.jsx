import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import { useState } from "react";

export default function ProductDetailDescription({ product, fetcher, productId, setToast }) {
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
          <Text variant="headingSm">Beschreibung</Text>
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
          <BlockStack gap="200">
            <TextField
              label="" labelHidden
              value={draft}
              onChange={setDraft}
              multiline={5}
              autoComplete="off"
            />
            <InlineStack gap="200">
              <Button variant="primary" size="slim" onClick={handleSave}>
                Speichern
              </Button>
              <Button size="slim" onClick={() => setEditing(false)}>
                Abbrechen
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
