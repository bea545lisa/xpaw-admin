import { Button, InlineStack, Text, TextField } from "@shopify/polaris";
import { useState } from "react";

export default function BulkActionsBar({
  selectedIds, localProducts, fetcher,
  setLocalProducts, setToast, clearSelection,
  allTags, handleBulkDelete,
}) {
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState(null);
  const [bulkTagSuggestions, setBulkTagSuggestions] = useState([]);

  if (selectedIds.length === 0) return null;

  const closeBulkTag = () => {
    setBulkTagMode(null);
    setBulkTagInput("");
    setBulkTagSuggestions([]);
  };

  const applyBulkTag = (tag) => {
    selectedIds.forEach(id => {
      const product = localProducts.find(p => p.node.id === id);
      if (!product) return;
      const currentTags = product.node.tags ?? [];
      const newTags = bulkTagMode === "add"
        ? [...new Set([...currentTags, tag])]
        : currentTags.filter(t => t !== tag);
      fetcher.submit({ action: "updateTags", id, tags: JSON.stringify(newTags) }, { method: "post" });
    });
    setLocalProducts(prev => prev.map(p => {
      if (!selectedIds.includes(p.node.id)) return p;
      const currentTags = p.node.tags ?? [];
      const newTags = bulkTagMode === "add"
        ? [...new Set([...currentTags, tag])]
        : currentTags.filter(t => t !== tag);
      return { node: { ...p.node, tags: newTags } };
    }));
    setToast(bulkTagMode === "add"
      ? `Tag "${tag}" bei ${selectedIds.length} Produkten hinzugefügt ✅`
      : `Tag "${tag}" bei ${selectedIds.length} Produkten entfernt 🗑️`
    );
    closeBulkTag();
    clearSelection();
  };

  return (
    <>
      <InlineStack align="space-between">
        <Text tone="subdued" variant="bodySm">{selectedIds.length} ausgewählt</Text>
        <InlineStack gap="200">

          <Button size="slim" onClick={() => setBulkTagMode("add")}>Tag hinzufügen</Button>

          <Button size="slim" onClick={() => {
            setBulkTagMode("remove");
            const selectedTags = new Set();
            localProducts
              .filter(p => selectedIds.includes(p.node.id))
              .forEach(p => p.node.tags?.forEach(t => selectedTags.add(t)));
            setBulkTagSuggestions(Array.from(selectedTags).sort().slice(0, 8));
          }}>Tag entfernen</Button>

          <Button size="slim" onClick={() => {
            selectedIds.forEach(id => fetcher.submit({ action: "updateStatus", id, status: "ACTIVE" }, { method: "post" }));
            setLocalProducts(prev => prev.map(p =>
              selectedIds.includes(p.node.id) ? { node: { ...p.node, status: "ACTIVE" } } : p
            ));
            setToast(`${selectedIds.length} Produkte aktiviert ✅`);
            clearSelection();
          }}>Aktivieren</Button>

          <Button size="slim" onClick={() => {
            selectedIds.forEach(id => fetcher.submit({ action: "updateStatus", id, status: "DRAFT" }, { method: "post" }));
            setLocalProducts(prev => prev.map(p =>
              selectedIds.includes(p.node.id) ? { node: { ...p.node, status: "DRAFT" } } : p
            ));
            setToast(`${selectedIds.length} Produkte auf Entwurf gesetzt 📝`);
            clearSelection();
          }}>Entwurf</Button>

          <Button tone="critical" size="slim" onClick={handleBulkDelete}>Löschen</Button>
        </InlineStack>
      </InlineStack>

      {/* Bulk-Tag Eingabe */}
      {bulkTagMode && (
        <div style={{
          padding: "8px 12px",
          background: "var(--p-color-bg-surface-secondary)",
          borderRadius: 8,
          border: "1px solid var(--p-color-border)",
        }}>
          <InlineStack gap="200" blockAlign="end">
            <div style={{ flex: 1, position: "relative" }}>
              <TextField
                label={bulkTagMode === "add" ? "Tag hinzufügen" : "Tag entfernen"}
                value={bulkTagInput}
                onChange={(val) => {
                  setBulkTagInput(val);
                  if (val.trim()) {
                    setBulkTagSuggestions(allTags.filter(t => t.toLowerCase().includes(val.toLowerCase())).slice(0, 8));
                  } else if (bulkTagMode === "remove") {
                    const selectedTags = new Set();
                    localProducts.filter(p => selectedIds.includes(p.node.id)).forEach(p => p.node.tags?.forEach(t => selectedTags.add(t)));
                    setBulkTagSuggestions(Array.from(selectedTags).sort().slice(0, 8));
                  } else {
                    setBulkTagSuggestions([]);
                  }
                }}
                autoComplete="off"
                placeholder="Tag eingeben..."
              />
              {bulkTagSuggestions.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "var(--p-color-bg-surface)",
                  border: "1px solid var(--p-color-border)",
                  borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100,
                }}>
                  {bulkTagSuggestions.map(tag => (
                    <div
                      key={tag}
                      onMouseDown={() => { setBulkTagInput(tag); setBulkTagSuggestions([]); }}
                      style={{ padding: "8px 16px", cursor: "pointer", borderBottom: "1px solid var(--p-color-border-subdued)", fontSize: "13px" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >{tag}</div>
                  ))}
                </div>
              )}
            </div>
            <Button variant="primary" size="slim" onClick={() => { if (bulkTagInput.trim()) applyBulkTag(bulkTagInput.trim()); }}>
              {bulkTagMode === "add" ? "Hinzufügen" : "Entfernen"}
            </Button>
            <Button size="slim" onClick={closeBulkTag}>Abbrechen</Button>
          </InlineStack>
        </div>
      )}
    </>
  );
}