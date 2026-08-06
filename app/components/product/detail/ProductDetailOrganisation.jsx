import { Card, BlockStack, Text, Button, InlineStack, Divider, TextField } from "@shopify/polaris";
import { useEffect, useRef} from "react";
import { useProductCollections } from "../../../hooks/useProductCollections.js";
import { useProductTags } from "../../../hooks/useProductTags.js";
import PositionedDropdown from "../../ui/PositionedDropdown.jsx";
import { useColorScheme } from "../../../context/ColorSchemeContext.js";

export default function ProductDetailOrganisation({ product, allCollections, allTags, fetcher }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const collections = useProductCollections({ initialCollections: product.collections?.edges?.map(e => e.node) ?? [], allCollections, fetcher, productId: product.id });
  const tags = useProductTags({ initialTags: product.tags ?? [], allTags, fetcher, productId: product.id });

  const tagInputRef = useRef(null);
  const collectionInputRef = useRef(null);

  const pill = {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "5px 10px", borderRadius: 999,
    border: isDark ? "1px solid rgba(255,255,255,0.28)" : "1px solid var(--p-color-border)",
    background: isDark ? "rgba(255,255,255,0.08)" : "var(--p-color-bg-surface-secondary)",
    fontSize: 12, lineHeight: 1,
  };
  const removeBtn = {
    border: "none", background: "transparent",
    cursor: "pointer", padding: 0,
    color: "var(--p-color-text-subdued)",
  };
  const dropdownItem = {
    padding: "8px 12px", cursor: "pointer", fontSize: 13,
    borderBottom: "1px solid var(--p-color-border-subdued)",
  };

  useEffect(() => {
    if (tags.showTagSearch) {
      setTimeout(() => tagInputRef.current?.querySelector("input")?.focus(), 50);
    }
  }, [tags.showTagSearch]);

  useEffect(() => {
    if (collections.showCollectionSearch) {
      setTimeout(() => collectionInputRef.current?.querySelector("input")?.focus(), 50);
    }
  }, [collections.showCollectionSearch]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingSm">Organisation</Text>
        <Divider />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
          {/* Collections */}
          <BlockStack gap="200">
            <Text variant="bodySm" fontWeight="semibold">Collections</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {collections.localCollections.map((c) => (
                <span key={c.id} style={pill}>
                  {c.title}
                  <button onClick={() => collections.handleCollectionRemove(c.id)} style={removeBtn}>✕</button>
                </span>
              ))}
              <Button size="micro" onClick={() => { collections.setShowCollectionSearch(true); collections.setCollectionResults(allCollections); }}>+</Button>
            </div>
            {collections.showCollectionSearch && (
              <div style={{ position: "relative" }}>
                <div ref={collectionInputRef}>
                  <TextField
                    label="" labelHidden placeholder="Collection suchen…"
                    value={collections.collectionSearch}
                    onChange={collections.setCollectionSearch}
                    autoComplete="off"
                    onBlur={() => setTimeout(() => collections.setShowCollectionSearch(false), 150)}
                  />
                </div>
                <PositionedDropdown anchorRef={collections.collectionInputRef} open={collections.showCollectionSearch && collections.filteredCollectionSuggestions.length > 0}>
                  {collections.filteredCollectionSuggestions.map((c) => (
                    <div key={c.id} onMouseDown={(e) => { e.preventDefault(); collections.handleCollectionAdd(c); }}
                      style={dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{c.title}</div>
                  ))}
                </PositionedDropdown>
              </div>
            )}
          </BlockStack>

          {/* Tags */}
          <BlockStack gap="200">
            <Text variant="bodySm" fontWeight="semibold">Tags</Text>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {tags.localTags.map((tag) => (
                <span key={tag} style={pill}>
                  {tag}
                  <button onClick={() => tags.handleTagRemove(tag)} style={removeBtn}>✕</button>
                </span>
              ))}
              <Button size="micro" onClick={() => {
                tags.setShowTagSearch(true);
                tags.setShowTagSuggestions(true);
                tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));
              }}>+</Button>
            </div>
            {tags.showTagSearch && (
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", gap: 8 }} ref={tags.tagInputRef}>
                  <div style={{ flex: 1 }}>
                    <div ref={tagInputRef} style={{ flex: 1 }}>
                      <TextField
                        ref={tagInputRef}
                        label="" labelHidden placeholder="Tag suchen oder eingeben…"
                        value={tags.tagInput}
                        onChange={(val) => {
                          tags.setTagInput(val);
                          tags.setTagSuggestions(
                            allTags.filter(t => !tags.localTags.includes(t) && t.toLowerCase().includes(val.toLowerCase()))
                          );
                        }}
                        autoComplete="off"
                        onFocus={() => {
                          tags.setShowTagSuggestions(true);
                          tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));  // ← hier auch
                        }}
                        onBlur={() => setTimeout(() => { tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); }, 150)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { tags.handleTagAdd(); tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); }
                          if (e.key === "Escape") { tags.setShowTagSearch(false); tags.setShowTagSuggestions(false); }
                        }}
                      />
                    </div>
                  </div>
                  <Button size="micro" onClick={() => {
                    tags.setShowTagSearch(true);
                    tags.setShowTagSuggestions(true);
                    tags.setTagSuggestions(allTags.filter(t => !tags.localTags.includes(t)));  // ← sofort alle laden
                  }}>+</Button>
                </div>
                <PositionedDropdown anchorRef={tags.tagInputRef}open={tags.showTagSuggestions && tags.tagSuggestions.length > 0}>
                  {tags.tagSuggestions.map((tag) => (
                    <div key={tag}
                      onMouseDown={(e) => { e.preventDefault(); const newTags = [...tags.localTags, tag]; tags.setLocalTags(newTags); tags.setTagInput(""); tags.setShowTagSuggestions(false); tags.setShowTagSearch(false); fetcher.submit({ action: "updateTags", id: product.id, tags: JSON.stringify(newTags) }, { method: "POST" }); }}
                      style={dropdownItem}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >{tag}</div>
                  ))}
                </PositionedDropdown>
              </div>
            )}
          </BlockStack>
        </div>
      </BlockStack>
    </Card>
  );
}
