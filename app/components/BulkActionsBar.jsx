import { Button, InlineStack, Text, TextField } from "@shopify/polaris";
import { useState } from "react";

export default function BulkActionsBar({
  selectedIds, localProducts, fetcher,
  setLocalProducts, setToast, clearSelection,
  allTags, allCollections = [], handleBulkDelete,
}) {
  const [bulkTagInput, setBulkTagInput] = useState("");
  const [bulkTagMode, setBulkTagMode] = useState(null);
  const [bulkTagSuggestions, setBulkTagSuggestions] = useState([]);

  const [bulkColInput, setBulkColInput] = useState("");
  const [bulkColMode, setBulkColMode] = useState(null); // "add" | "remove"
  const [bulkColSuggestions, setBulkColSuggestions] = useState([]);

  if (selectedIds.length === 0) return null;

  // ── Tag helpers ──────────────────────────────────────────────────────
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
      ? `Tag "${tag}" bei ${selectedIds.length} Produkten hinzugefügt`
      : `Tag "${tag}" bei ${selectedIds.length} Produkten entfernt`
    );
    closeBulkTag();
    clearSelection();
  };

  // ── Collection helpers ───────────────────────────────────────────────
  const closeBulkCol = () => {
    setBulkColMode(null);
    setBulkColInput("");
    setBulkColSuggestions([]);
  };

  const openBulkColAdd = () => {
    setBulkColMode("add");
    setBulkColInput("");
    setBulkColSuggestions(allCollections.slice(0, 8));
  };

  const openBulkColRemove = () => {
    setBulkColMode("remove");
    setBulkColInput("");
    // only collections that appear in at least one selected product
    const colMap = new Map();
    localProducts
      .filter(p => selectedIds.includes(p.node.id))
      .forEach(p => p.node.collections?.edges?.forEach(({ node: c }) => colMap.set(c.id, c)));
    setBulkColSuggestions(Array.from(colMap.values()).slice(0, 8));
  };

  const applyBulkCol = (col) => {
    selectedIds.forEach(id => {
      const fd = { action: bulkColMode === "add" ? "addToCollection" : "removeFromCollection", productId: id, collectionId: col.id };
      fetcher.submit(fd, { method: "post" });
    });
    setLocalProducts(prev => prev.map(p => {
      if (!selectedIds.includes(p.node.id)) return p;
      const edges = p.node.collections?.edges ?? [];
      const newEdges = bulkColMode === "add"
        ? edges.some(e => e.node.id === col.id) ? edges : [...edges, { node: col }]
        : edges.filter(e => e.node.id !== col.id);
      return { node: { ...p.node, collections: { edges: newEdges } } };
    }));
    setToast(bulkColMode === "add"
      ? `Kollektion „${col.title}" bei ${selectedIds.length} Produkten hinzugefügt`
      : `Kollektion „${col.title}" bei ${selectedIds.length} Produkten entfernt`
    );
    closeBulkCol();
    clearSelection();
  };

  const filterColSuggestions = (val) => {
    const base = bulkColMode === "remove"
      ? (() => {
          const colMap = new Map();
          localProducts.filter(p => selectedIds.includes(p.node.id))
            .forEach(p => p.node.collections?.edges?.forEach(({ node: c }) => colMap.set(c.id, c)));
          return Array.from(colMap.values());
        })()
      : allCollections;
    return val.trim()
      ? base.filter(c => c.title.toLowerCase().includes(val.toLowerCase())).slice(0, 8)
      : base.slice(0, 8);
  };

  return (
    <>
      <InlineStack align="space-between">
        <Text tone="subdued" variant="bodySm">{selectedIds.length} ausgewählt</Text>
        <InlineStack gap="200">
          <Button size="slim" onClick={() => { closeBulkCol(); setBulkTagMode("add"); }}>Tag hinzufügen</Button>
          <Button size="slim" onClick={() => {
            closeBulkCol();
            setBulkTagMode("remove");
            const selectedTags = new Set();
            localProducts.filter(p => selectedIds.includes(p.node.id)).forEach(p => p.node.tags?.forEach(t => selectedTags.add(t)));
            setBulkTagSuggestions(Array.from(selectedTags).sort().slice(0, 8));
          }}>Tag entfernen</Button>

          <Button size="slim" onClick={() => { closeBulkTag(); openBulkColAdd(); }}>Kollektion hinzufügen</Button>
          <Button size="slim" onClick={() => { closeBulkTag(); openBulkColRemove(); }}>Kollektion entfernen</Button>

          <Button size="slim" onClick={() => {
            selectedIds.forEach(id => fetcher.submit({ action: "updateStatus", id, status: "ACTIVE" }, { method: "post" }));
            setLocalProducts(prev => prev.map(p =>
              selectedIds.includes(p.node.id) ? { node: { ...p.node, status: "ACTIVE" } } : p
            ));
            setToast(`${selectedIds.length} Produkte aktiviert`);
            clearSelection();
          }}>Aktivieren</Button>

          <Button size="slim" onClick={() => {
            selectedIds.forEach(id => fetcher.submit({ action: "updateStatus", id, status: "DRAFT" }, { method: "post" }));
            setLocalProducts(prev => prev.map(p =>
              selectedIds.includes(p.node.id) ? { node: { ...p.node, status: "DRAFT" } } : p
            ));
            setToast(`${selectedIds.length} Produkte auf Entwurf gesetzt`);
            clearSelection();
          }}>Entwurf</Button>

          <Button tone="critical" size="slim" onClick={handleBulkDelete}>Löschen</Button>
        </InlineStack>
      </InlineStack>

      {/* Bulk-Tag Panel */}
      {bulkTagMode && (
        <BulkPanel
          label={bulkTagMode === "add" ? "Tag hinzufügen" : "Tag entfernen"}
          inputValue={bulkTagInput}
          onInputChange={(val) => {
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
          onFocus={() => {
            if (!bulkTagInput.trim()) {
              if (bulkTagMode === "remove") {
                const selectedTags = new Set();
                localProducts.filter(p => selectedIds.includes(p.node.id)).forEach(p => p.node.tags?.forEach(t => selectedTags.add(t)));
                setBulkTagSuggestions(Array.from(selectedTags).sort().slice(0, 8));
              } else {
                setBulkTagSuggestions(allTags.slice(0, 8));
              }
            }
          }}
          suggestions={bulkTagSuggestions}
          onSuggestionClick={(s) => { setBulkTagInput(s); setBulkTagSuggestions([]); }}
          onApply={() => { if (bulkTagInput.trim()) applyBulkTag(bulkTagInput.trim()); }}
          onCancel={closeBulkTag}
          confirmLabel={bulkTagMode === "add" ? "Hinzufügen" : "Entfernen"}
          placeholder="Tag eingeben..."
        />
      )}

      {/* Bulk-Kollektion Panel */}
      {bulkColMode && (
        <BulkPanel
          label={bulkColMode === "add" ? "Kollektion hinzufügen" : "Kollektion entfernen"}
          inputValue={bulkColInput}
          onInputChange={(val) => {
            setBulkColInput(val);
            setBulkColSuggestions(filterColSuggestions(val));
          }}
          suggestions={bulkColSuggestions.map(c => c.title)}
          onSuggestionClick={(title) => {
            setBulkColInput(title);
            setBulkColSuggestions([]);
          }}
          onApply={() => {
            const col = allCollections.find(c => c.title.toLowerCase() === bulkColInput.trim().toLowerCase());
            if (col) applyBulkCol(col);
          }}
          onCancel={closeBulkCol}
          confirmLabel={bulkColMode === "add" ? "Hinzufügen" : "Entfernen"}
          placeholder="Kollektion suchen..."
          applyDisabled={!allCollections.some(c => c.title.toLowerCase() === bulkColInput.trim().toLowerCase())}
        />
      )}
    </>
  );
}

function BulkPanel({ label, inputValue, onInputChange, onFocus, suggestions, onSuggestionClick, onApply, onCancel, confirmLabel, placeholder, applyDisabled }) {
  return (
    <div style={{
      padding: "8px 12px",
      background: "var(--p-color-bg-surface-secondary)",
      borderRadius: 8,
      border: "1px solid var(--p-color-border)",
    }}>
      <InlineStack gap="200" blockAlign="end">
        <div style={{ flex: 1, position: "relative" }}>
          <TextField
            label={label}
            value={inputValue}
            onChange={onInputChange}
            onFocus={onFocus}
            autoComplete="off"
            placeholder={placeholder}
          />
          {suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              background: "var(--p-color-bg-surface)",
              border: "1px solid var(--p-color-border)",
              borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", zIndex: 100,
            }}>
              {suggestions.map(s => (
                <div
                  key={s}
                  onMouseDown={() => onSuggestionClick(s)}
                  style={{ padding: "8px 16px", cursor: "pointer", borderBottom: "1px solid var(--p-color-border-subdued)", fontSize: "13px" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >{s}</div>
              ))}
            </div>
          )}
        </div>
        <Button variant="primary" size="slim" onClick={onApply} disabled={applyDisabled}>
          {confirmLabel}
        </Button>
        <Button size="slim" onClick={onCancel}>Abbrechen</Button>
      </InlineStack>
    </div>
  );
}
