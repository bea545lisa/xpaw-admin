import {
  Modal, BlockStack, InlineStack, Text, TextField,
  Button, Select, Divider, Box,
} from "@shopify/polaris";

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

export default function MetafieldsModal({
  open,
  onClose,
  metafields,
  newMetafield,
  setNewMetafield,
  onSave,
  onDelete,
  //productId,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Metafields"
      size="large"
    >
      <Modal.Section>
        <BlockStack gap="400">

          {/* Bestehende Metafields */}
          {metafields.length === 0 && (
            <Text tone="subdued">Keine Metafields vorhanden.</Text>
          )}

          {metafields.map(m => (
            <Box key={m.id} padding="300" background="bg-surface-secondary" borderRadius="200">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="bodySm" tone="subdued">{m.namespace}.{m.key} ({m.type})</Text>
                  <Text>{m.value}</Text>
                </BlockStack>
               <Button
                tone="critical"
                size="slim"
                onClick={() => onDelete(m.id, m.namespace, m.key)}
              >
                Löschen
              </Button>
              </InlineStack>
            </Box>
          ))}

          <Divider />

          {/* Neues Metafield */}
          <Text variant="headingSm">Neues Metafield</Text>

          <InlineStack gap="300">
            <div style={{ flex: 1 }}>
              <TextField
                label="Namespace"
                value={newMetafield.namespace}
                onChange={v => setNewMetafield(prev => ({ ...prev, namespace: v }))}
                autoComplete="off"
                placeholder="custom"
              />
            </div>
            <div style={{ flex: 1 }}>
              <TextField
                label="Key"
                value={newMetafield.key}
                onChange={v => setNewMetafield(prev => ({ ...prev, key: v }))}
                autoComplete="off"
                placeholder="material"
              />
            </div>
          </InlineStack>

          <Select
            label="Typ"
            options={TYPE_OPTIONS}
            value={newMetafield.type}
            onChange={v => setNewMetafield(prev => ({ ...prev, type: v }))}
          />

          <TextField
            label="Wert"
            value={newMetafield.value}
            onChange={v => setNewMetafield(prev => ({ ...prev, value: v }))}
            autoComplete="off"
            multiline={3}
          />

          <Button
            variant="primary"
            onClick={onSave}
            disabled={!newMetafield.namespace || !newMetafield.key || !newMetafield.value}
          >
            Metafield speichern
          </Button>

        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
