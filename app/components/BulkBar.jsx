import { InlineStack, Text, Button } from "@shopify/polaris";

export default function BulkBar({ selectedIds, onDelete }) {
  if (selectedIds.length === 0) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "white",
        padding: 0,
      }}
    >
      <InlineStack
        align="space-between"
        paddingBlock="200" paddingInline="200"
        background="bg-surface-secondary"
        borderRadius="200"
      >
        <Text>{selectedIds.length} ausgewählt</Text>

        <Button tone="critical" onClick={onDelete}>
          Löschen
        </Button>
      </InlineStack>
    </div>
  );
}




