import { TextField, Text, BlockStack, InlineStack, Button, Tag, Spinner } from "@shopify/polaris";
import { useFetcher } from "react-router";
import { useState, useEffect } from "react";

export default function CollectionsTagsSection({
  productId, setLocalProducts,
  initialTags, allTags, modalOpen,
  productCollections, searchResults, searchQuery, isSearchOpen, setIsSearchOpen,
  handleSearch, handleSearchFocus, addToCollection, removeFromCollection, isSearching,
}) {
  const [editTags, setEditTags] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState([]);
  const tagFetcher = useFetcher();

  useEffect(() => {
    if (modalOpen && productId) setEditTags(initialTags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, productId]);

  useEffect(() => {
    if (tagFetcher.state !== "idle" || !tagFetcher.data?.ok) return;
    setLocalProducts(prev => prev.map(p =>
      p.node.id === productId
        ? { node: { ...p.node, tags: tagFetcher.data.product.tags } }
        : p
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFetcher.state, tagFetcher.data]);

  const submitTag = (tags) => {
    tagFetcher.submit(
      { action: "updateTags", id: productId, tags: JSON.stringify(tags) },
      { method: "POST" }
    );
  };

  const addTag = (tag) => {
    const updated = [...(editTags ?? []), tag];
    setEditTags(updated);
    setNewTag("");
    setTagSuggestions([]);
    submitTag(updated);
  };

  const removeTag = (index) => {
    const updated = editTags.filter((_, j) => j !== index);
    setEditTags(updated);
    submitTag(updated);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

      {/* Collections */}
      <div>
        <Text variant="headingSm" as="h3">Collections</Text>
        <div style={{ position: "relative" }}>
          <TextField
            value={searchQuery}
            onChange={handleSearch}
            onFocus={handleSearchFocus}
            onBlur={() => setTimeout(() => setIsSearchOpen(false), 200)}
            placeholder="Collection suchen..."
            autoComplete="off"
            prefix={isSearching ? <Spinner size="small" /> : undefined}
          />
          {isSearchOpen && (searchResults.length > 0 || searchQuery) && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0,
              background: "var(--p-color-bg-surface)",
              border: "1px solid var(--p-color-border)",
              borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              zIndex: 100, maxHeight: 200, overflowY: "auto",
            }}>
              {searchResults.length === 0 && searchQuery && !isSearching && (
                <div style={{ padding: "12px 16px" }}>
                  <Text tone="subdued">Keine Collections gefunden</Text>
                </div>
              )}
              {searchResults.map(c => (
                <div
                  key={c.id}
                  onMouseDown={() => addToCollection(c)}
                  style={{
                    padding: "10px 16px", cursor: "pointer",
                    borderBottom: "1px solid var(--p-color-border-subdued)",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  {c.image && (
                    <img src={c.image.url} alt={c.image.altText ?? c.title}
                      style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover" }} />
                  )}
                  <Text>{c.title}</Text>
                </div>
              ))}
            </div>
          )}
        </div>
        {productCollections.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <InlineStack gap="200" wrap>
              {productCollections.map(c => (
                <Tag key={c.id} onRemove={() => removeFromCollection(c.id)}>{c.title}</Tag>
              ))}
            </InlineStack>
          </div>
        )}
      </div>

      {/* Tags */}
      <div>
        <Text variant="headingSm" as="h3">Tags</Text>
        <InlineStack gap="200" blockAlign="end">
          <div style={{ flex: 1, position: "relative" }}>
            <TextField
              label="" labelHidden
              value={newTag}
              onChange={(val) => {
                setNewTag(val);
                if (val.trim()) {
                  setTagSuggestions(allTags.filter(t =>
                    t.toLowerCase().includes(val.toLowerCase()) && !editTags.includes(t)
                  ).slice(0, 8));
                } else {
                  setTagSuggestions([]);
                }
              }}
              placeholder="Tag hinzufügen..."
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newTag.trim()) addTag(newTag.trim());
                if (e.key === "Escape") setTagSuggestions([]);
              }}
            />
            {tagSuggestions.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "var(--p-color-bg-surface)",
                border: "1px solid var(--p-color-border)",
                borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 100, maxHeight: 200, overflowY: "auto",
              }}>
                {tagSuggestions.map(tag => (
                  <div
                    key={tag}
                    onMouseDown={() => addTag(tag)}
                    style={{
                      padding: "8px 16px", cursor: "pointer",
                      borderBottom: "1px solid var(--p-color-border-subdued)", fontSize: "13px",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >{tag}</div>
                ))}
              </div>
            )}
          </div>
          <Button size="slim" onClick={() => { if (newTag.trim()) addTag(newTag.trim()); }}>+</Button>
        </InlineStack>
        <div style={{ marginTop: 8 }}>
          <InlineStack gap="200" wrap>
            {(editTags ?? []).map((tag, i) => (
              <Tag key={i} onRemove={() => removeTag(i)}>{tag}</Tag>
            ))}
          </InlineStack>
        </div>
      </div>

    </div>
  );
}