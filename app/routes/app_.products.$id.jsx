import { useLoaderData, useNavigate, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page, Layout, Card, BlockStack, Text, Button, InlineStack,
  Badge, Divider, TextField, Box, Spinner, Modal, Icon,
} from "@shopify/polaris";
import { EditIcon, XIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);

  const res = await admin.graphql(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id title status description vendor productType createdAt updatedAt tags
        featuredImage { url altText }
        images(first: 10) {
          edges { node { id url altText } }
        }
        collections(first: 20) {
          edges { node { id title } }
        }
        options { id name values }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { url altText }
              inventoryItem { id }
            }
          }
        }
        media(first: 10) {
          edges {
            node {
              id mediaContentType
              ... on MediaImage { image { url altText } }
            }
          }
        }
      }
    }
  `, { variables: { id: `gid://shopify/Product/${params.id}` } });

  const data = await res.json();

  // Alle Store-Tags für Autocomplete
  let allTags = [];
  try {
    const tagsRes = await admin.graphql(`query { productTags(first: 250) { edges { node } } }`);
    const tagsJson = await tagsRes.json();
    allTags = tagsJson.data?.productTags?.edges?.map(e => e.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Lager-Location (erste Location)
  const locRes = await admin.graphql(`query { locations(first: 1) { edges { node { id } } } }`);
  const locJson = await locRes.json();
  const locationId = locJson.data.locations.edges[0]?.node?.id ?? null;

  return { product: data.data.product, allTags, locationId };
};

// ─── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const type = formData.get("action");

  // SKU oder Barcode einer Variante
  // Alle Felder einer Variante auf einmal speichern
  if (type === "updateVariantAll") {
    const variantId = formData.get("variantId");
    const productId = formData.get("productId");
    await admin.graphql(`
      mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          userErrors { field message }
        }
      }
    `, {
      variables: {
        productId,
        variants: [{
          id: variantId,
          price: formData.get("price"),
          compareAtPrice: formData.get("compareAtPrice") || null,
          barcode: formData.get("barcode") || null,
          inventoryItem: { sku: formData.get("sku") },
        }],
      },
    });
    const inventoryItemId = formData.get("inventoryItemId");
    const locId = formData.get("locationId");
    const quantity = parseInt(formData.get("quantity"), 10);
    if (inventoryItemId && locId && !isNaN(quantity)) {
      await admin.graphql(`
        mutation($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message }
          }
        }
      `, {
        variables: {
          input: {
            name: "available", reason: "correction", ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId, locationId: locId, quantity }],
          },
        },
      });
    }
    return { ok: true, type: "updateVariantAll", variantId };
  }

  // Status
  if (type === "updateStatus") {
    const res = await admin.graphql(`
      mutation($id: ID!, $status: ProductStatus!) {
        productUpdate(input: { id: $id, status: $status }) {
          product { id status }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), status: formData.get("status") } });
    const data = await res.json();
    return { ok: true, type: "updateStatus", product: data.data.productUpdate.product };
  }

  // Beschreibung
  if (type === "updateDescription") {
    await admin.graphql(`
      mutation($id: ID!, $descriptionHtml: String!) {
        productUpdate(input: { id: $id, descriptionHtml: $descriptionHtml }) {
          product { id }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), descriptionHtml: formData.get("description") } });
    return { ok: true, type: "updateDescription" };
  }

  // Tags
  if (type === "updateTags") {
    const tags = JSON.parse(formData.get("tags"));
    const res = await admin.graphql(`
      mutation($id: ID!, $tags: [String!]!) {
        productUpdate(input: { id: $id, tags: $tags }) {
          product { id tags }
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("id"), tags } });
    const data = await res.json();
    return { ok: true, type: "updateTags", tags: data.data.productUpdate.product.tags };
  }

  // Collections durchsuchen
  if (type === "searchCollections") {
    const res = await admin.graphql(`
      query($query: String!) {
        collections(first: 8, query: $query) {
          edges { node { id title } }
        }
      }
    `, { variables: { query: formData.get("query") } });
    const data = await res.json();
    return {
      ok: true, type: "searchCollections",
      collections: data.data.collections.edges.map(e => e.node),
    };
  }

  // Produkt zur Collection hinzufügen
  if (type === "addToCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return {
      ok: true, type: "addToCollection",
      collection: { id: formData.get("collectionId"), title: formData.get("collectionTitle") },
    };
  }

  // Produkt aus Collection entfernen
  if (type === "removeFromCollection") {
    await admin.graphql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionRemoveProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { variables: { id: formData.get("collectionId"), productIds: [formData.get("productId")] } });
    return { ok: true, type: "removeFromCollection", collectionId: formData.get("collectionId") };
  }

  // Löschen
  if (type === "delete") {
    await admin.graphql(`
      mutation($input: ProductDeleteInput!) {
        productDelete(input: $input) { deletedProductId }
      }
    `, { variables: { input: { id: formData.get("id") } } });
    return { ok: true, type: "delete" };
  }

  return null;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_TONE = { ACTIVE: "success", DRAFT: "info", ARCHIVED: "warning" };
const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Kleines ✕-Tag
function RemovableTag({ label, onRemove, color = "var(--p-color-bg-fill-secondary)", textColor = "var(--p-color-text-secondary)" }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: "12px", background: color, color: textColor,
      borderRadius: 4, padding: "2px 6px 2px 8px",
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none", border: "none", cursor: "pointer",
          padding: 0, lineHeight: 1, fontSize: 12,
          color: textColor, opacity: 0.6,
          display: "flex", alignItems: "center",
        }}
        title="Entfernen"
      >✕</button>
    </span>
  );
}

// Dropdown via Portal — entkommt dem Card-overflow-Clipping
function PositionedDropdown({ anchorRef, open, children }) {
  if (!open) return null;
  const rect = anchorRef.current?.getBoundingClientRect();
  if (!rect) return null;
  return createPortal(
    <div style={{
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      background: "var(--p-color-bg-surface)",
      border: "1px solid var(--p-color-border)",
      borderRadius: 6,
      zIndex: 9999,
      boxShadow: "0 4px 16px rgba(0,0,0,0.14)",
      maxHeight: 220,
      overflowY: "auto",
    }}>
      {children}
    </div>,
    document.body
  );
}

// ─── Komponente ────────────────────────────────────────────────────────────────

export default function ProductDetail() {
  const { product, allTags = [], locationId } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();
  const fetcher = useFetcher();
  const collectionFetcher = useFetcher();

  // ── Refs für Portal-Dropdowns ──
  const collectionInputRef = useRef(null);
  const tagInputRef = useRef(null);

  // ── Basis-State ──
  const [selectedImage, setSelectedImage] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // ── Beschreibung ──
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(product.description ?? "");

  // ── Tags ──
  const [localTags, setLocalTags] = useState(product.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showTagSearch, setShowTagSearch] = useState(false);

  // ── Collections ──
  const initCollections = product.collections?.edges?.map(e => e.node) ?? [];
  const [localCollections, setLocalCollections] = useState(initCollections);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionResults, setCollectionResults] = useState([]);
  const [showCollectionSearch, setShowCollectionSearch] = useState(false);

  // ── Varianten (lokaler State für optimistic UI) ──
  const [localVariants, setLocalVariants] = useState(
    product.variants?.edges?.map(e => e.node) ?? []
  );

  const images = product.images?.edges?.map(e => e.node) ?? [];
  const hasVariants = localVariants.length > 1 || localVariants[0]?.title !== "Default Title";
  const totalStock = localVariants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  const hasZeroStock = localVariants.some(v => (v.inventoryQuantity ?? 0) === 0);

  const isSaving = fetcher.state !== "idle";

  // Tags-Autocomplete: alle Store-Tags gefiltert nach Eingabe + noch nicht vergeben
  const filteredTagSuggestions = tagInput.length > 0
    ? allTags
        .filter(t => !localTags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase()))
        .slice(0, 10)
    : allTags.filter(t => !localTags.includes(t)).slice(0, 10);

  // ── Effekte: fetcher responses ──
  useEffect(() => {
    if (fetcher.data?.type === "updateTags") {
      setLocalTags((prev) => fetcher.data.tags ?? prev);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!collectionFetcher.data) return;
    const d = collectionFetcher.data;
    if (d.type === "searchCollections") {
      setCollectionResults(d.collections ?? []);
    } else if (d.type === "addToCollection") {
      if (d.collection) {
        setLocalCollections(prev =>
          prev.find(c => c.id === d.collection.id) ? prev : [...prev, d.collection]
        );
      }
    } else if (d.type === "removeFromCollection") {
      setLocalCollections(prev => prev.filter(c => c.id !== d.collectionId));
    }
  }, [collectionFetcher.data]);

  // Debounced collection search
  useEffect(() => {
    if (collectionSearch.length < 2) {
      setCollectionResults([]);
      return;
    }
    const t = setTimeout(() => {
      collectionFetcher.submit(
        { action: "searchCollections", query: collectionSearch },
        { method: "POST" }
      );
    }, 400);
    return () => clearTimeout(t);
  }, [collectionSearch, collectionFetcher]);

  // ── Handler ──
  const handleDelete = () => {
    fetcher.submit({ action: "delete", id: product.id }, { method: "POST" });
    setDeleteModalOpen(false);
    navigate(`/app${location.search}`);
  };

  const handleStatusToggle = () => {
    const newStatus = product.status === "ACTIVE" ? "DRAFT" : "ACTIVE";
    fetcher.submit({ action: "updateStatus", id: product.id, status: newStatus }, { method: "POST" });
  };

  // ── Varianten-Edit (aufklappbares Panel) ──
  const [editingVariantId, setEditingVariantId] = useState(null);
  const [variantDraft, setVariantDraft] = useState({});

  const openVariantEdit = (v) => {
    setEditingVariantId(v.id);
    setVariantDraft({
      price: v.price ?? "",
      compareAtPrice: v.compareAtPrice ?? "",
      inventoryQuantity: String(v.inventoryQuantity ?? 0),
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
    });
  };

  const handleVariantSave = (v) => {
    const qty = parseInt(variantDraft.inventoryQuantity, 10);
    fetcher.submit({
      action: "updateVariantAll",
      productId: product.id,
      variantId: v.id,
      price: variantDraft.price,
      compareAtPrice: variantDraft.compareAtPrice,
      sku: variantDraft.sku,
      barcode: variantDraft.barcode,
      quantity: String(isNaN(qty) ? (v.inventoryQuantity ?? 0) : qty),
      inventoryItemId: v.inventoryItem?.id ?? "",
      locationId: locationId ?? "",
    }, { method: "POST" });
    setLocalVariants(prev => prev.map(lv => lv.id === v.id ? {
      ...lv,
      price: variantDraft.price,
      compareAtPrice: variantDraft.compareAtPrice || null,
      sku: variantDraft.sku,
      barcode: variantDraft.barcode,
      inventoryQuantity: isNaN(qty) ? lv.inventoryQuantity : qty,
    } : lv));
    setEditingVariantId(null);
  };

  const handleDescriptionSave = () => {
    fetcher.submit(
      { action: "updateDescription", id: product.id, description: descriptionDraft },
      { method: "POST" }
    );
    setEditingDescription(false);
  };

  const handleTagAdd = () => {
    const tag = tagInput.trim();
    if (!tag || localTags.includes(tag)) { setTagInput(""); return; }
    const newTags = [...localTags, tag];
    setLocalTags(newTags);
    setTagInput("");
    fetcher.submit({ action: "updateTags", id: product.id, tags: JSON.stringify(newTags) }, { method: "POST" });
  };

  const handleTagRemove = (tag) => {
    const newTags = localTags.filter(t => t !== tag);
    setLocalTags(newTags);
    fetcher.submit({ action: "updateTags", id: product.id, tags: JSON.stringify(newTags) }, { method: "POST" });
  };

  const handleCollectionAdd = (col) => {
    if (localCollections.find(c => c.id === col.id)) return;
    setLocalCollections(prev => [...prev, col]);
    collectionFetcher.submit(
      { action: "addToCollection", collectionId: col.id, collectionTitle: col.title, productId: product.id },
      { method: "POST" }
    );
    setCollectionSearch("");
    setCollectionResults([]);
  };

  const handleCollectionRemove = (colId) => {
    setLocalCollections(prev => prev.filter(c => c.id !== colId));
    collectionFetcher.submit(
      { action: "removeFromCollection", collectionId: colId, productId: product.id },
      { method: "POST" }
    );
  };

  return (
    <Page
      title={product.title}
      titleMetadata={<Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>}
      backAction={{ onAction: () => navigate(`/app${location.search}`) }}
      primaryAction={{
        content: product.status === "ACTIVE" ? "Auf Entwurf setzen" : "Aktivieren",
        onAction: handleStatusToggle,
        loading: isSaving,
      }}
      secondaryActions={[
        {
          content: "Im Shop ansehen",
          onAction: () => {},
          disabled: product.status !== "ACTIVE",
        },
        {
          content: "Löschen",
          destructive: true,
          onAction: () => setDeleteModalOpen(true),
        },
      ]}
    >
      <Layout>

        {/* ── Linke Spalte ── */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">

            {/* Bilder */}
            <Card padding="0">
              <div style={{
                width: "100%", aspectRatio: "1",
                background: "var(--p-color-bg-surface-secondary)",
                overflow: "hidden", borderRadius: "8px 8px 0 0",
              }}>
                {images[selectedImage] ? (
                  <img
                    src={images[selectedImage].url}
                    alt={images[selectedImage].altText ?? product.title}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                ) : (
                  <div style={{
                    width: "100%", height: "100%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "var(--p-color-text-subdued)", fontSize: 14,
                  }}>
                    Kein Bild
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <Box padding="200">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {images.map((img, i) => (
                      <button
                        key={img.id}
                        onClick={() => setSelectedImage(i)}
                        style={{
                          width: 56, height: 56, borderRadius: 6, overflow: "hidden",
                          cursor: "pointer", padding: 0, background: "none",
                          border: `2px solid ${i === selectedImage ? "var(--p-color-border-focus)" : "var(--p-color-border)"}`,
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={img.url}
                          alt={img.altText ?? ""}
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </button>
                    ))}
                  </div>
                </Box>
              )}
            </Card>

            {/* Produktinfos */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingSm">Produktinfos</Text>
                <Divider />
                {[
                  ["Hersteller", product.vendor || "—"],
                  ["Typ", product.productType || "—"],
                  ["Erstellt", formatDate(product.createdAt)],
                  ["Aktualisiert", formatDate(product.updatedAt)],
                  ["Gesamtlager", (
                    <span key="lager" style={{ color: hasZeroStock ? "#f97316" : "inherit" }}>
                      {totalStock} {hasZeroStock ? "⚠" : ""}
                    </span>
                  )],
                ].map(([label, value]) => (
                  <InlineStack key={label} align="space-between">
                    <Text tone="subdued" variant="bodySm">{label}</Text>
                    <Text variant="bodySm">{value}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
            </Card>

            {/* ── Collections (editierbar) ── */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">Collections</Text>
                  <Button
                    size="micro"
                    onClick={() => setShowCollectionSearch(p => !p)}
                  >
                    {showCollectionSearch ? "Schließen" : "+ Hinzufügen"}
                  </Button>
                </InlineStack>
                <Divider />

                {/* Vorhandene Collections */}
                {localCollections.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {localCollections.map(c => (
                      <RemovableTag
                        key={c.id}
                        label={c.title}
                        color="var(--p-color-bg-fill-info-secondary)"
                        textColor="var(--p-color-text-info)"
                        onRemove={() => handleCollectionRemove(c.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <Text tone="subdued" variant="bodySm">Keine Collections zugewiesen</Text>
                )}

                {/* Suche */}
                {showCollectionSearch && (
                  <div style={{ position: "relative" }}>
                    <div ref={collectionInputRef}>
                      <TextField
                        label="" labelHidden
                        placeholder="Collection suchen…"
                        value={collectionSearch}
                        onChange={setCollectionSearch}
                        autoComplete="off"
                      />
                    </div>
                    <PositionedDropdown
                      anchorRef={collectionInputRef}
                      open={collectionResults.filter(c => !localCollections.find(lc => lc.id === c.id)).length > 0}
                    >
                      {collectionResults
                        .filter(c => !localCollections.find(lc => lc.id === c.id))
                        .map(c => (
                          <div
                            key={c.id}
                            onMouseDown={(e) => { e.preventDefault(); handleCollectionAdd(c); }}
                            style={{
                              padding: "8px 12px", cursor: "pointer", fontSize: 13,
                              borderBottom: "1px solid var(--p-color-border-subdued)",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            {c.title}
                          </div>
                        ))}
                    </PositionedDropdown>
                  </div>
                )}
              </BlockStack>
            </Card>

            {/* ── Tags (editierbar) ── */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">Tags</Text>
                  <Button
                    size="micro"
                    onClick={() => { setShowTagSearch(p => !p); setTagInput(""); setShowTagSuggestions(false); }}
                  >
                    {showTagSearch ? "Schließen" : "+ Hinzufügen"}
                  </Button>
                </InlineStack>
                <Divider />

                {localTags.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[...localTags].sort().map((tag) => (
                      <RemovableTag
                        key={tag}
                        label={tag}
                        onRemove={() => handleTagRemove(tag)}
                      />
                    ))}
                  </div>
                ) : (
                  <Text tone="subdued" variant="bodySm">Keine Tags</Text>
                )}

                {/* Tag hinzufügen */}
                {showTagSearch && (
                  <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", gap: 8 }} ref={tagInputRef}>
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="" labelHidden
                          placeholder="Tag suchen oder eingeben…"
                          value={tagInput}
                          onChange={setTagInput}
                          autoComplete="off"
                          onFocus={() => setShowTagSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { handleTagAdd(); setShowTagSuggestions(false); }
                            if (e.key === "Escape") { setShowTagSearch(false); setShowTagSuggestions(false); }
                          }}
                        />
                      </div>
                      <Button onClick={() => { handleTagAdd(); setShowTagSuggestions(false); }} disabled={!tagInput.trim()}>+</Button>
                    </div>
                    <PositionedDropdown
                      anchorRef={tagInputRef}
                      open={showTagSuggestions && filteredTagSuggestions.length > 0}
                    >
                      {filteredTagSuggestions.map(tag => (
                        <div
                          key={tag}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const newTags = [...localTags, tag];
                            setLocalTags(newTags);
                            setTagInput("");
                            setShowTagSuggestions(false);
                            fetcher.submit(
                              { action: "updateTags", id: product.id, tags: JSON.stringify(newTags) },
                              { method: "POST" }
                            );
                          }}
                          style={{
                            padding: "8px 12px", cursor: "pointer", fontSize: 13,
                            borderBottom: "1px solid var(--p-color-border-subdued)",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          {tag}
                        </div>
                      ))}
                    </PositionedDropdown>
                  </div>
                )}
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

        {/* ── Rechte Spalte ── */}
        <Layout.Section>
          <BlockStack gap="400">

            {/* ── Beschreibung (editierbar) ── */}
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">Beschreibung</Text>
                  {!editingDescription && (
                    <Button
                      size="micro"
                      onClick={() => { setDescriptionDraft(product.description ?? ""); setEditingDescription(true); }}
                    >
                      Bearbeiten
                    </Button>
                  )}
                </InlineStack>
                <Divider />

                {editingDescription ? (
                  <BlockStack gap="200">
                    <TextField
                      label="" labelHidden
                      value={descriptionDraft}
                      onChange={setDescriptionDraft}
                      multiline={5}
                      autoComplete="off"
                    />
                    <InlineStack gap="200">
                      <Button variant="primary" size="slim" onClick={handleDescriptionSave}>
                        Speichern
                      </Button>
                      <Button size="slim" onClick={() => setEditingDescription(false)}>
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

            {/* Optionen */}
            {product.options?.filter(o => o.name !== "Title").length > 0 && (
              <Card>
                <BlockStack gap="200">
                  <Text variant="headingSm">Optionen</Text>
                  <Divider />
                  {product.options.filter(o => o.name !== "Title").map(o => (
                    <InlineStack key={o.id} gap="300" blockAlign="start">
                      <Text variant="bodySm" tone="subdued" as="span">{o.name}:</Text>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {o.values.map((v, i) => (
                          <span key={i} style={{
                            fontSize: "12px", borderRadius: 4,
                            border: "1px solid var(--p-color-border)",
                            padding: "1px 8px",
                          }}>
                            {v}
                          </span>
                        ))}
                      </div>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            )}


            {/* ── Varianten ── */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">
                    {hasVariants ? `Varianten (${localVariants.length})` : "Preis & Lager"}
                  </Text>
                  {isSaving && <Spinner size="small" />}
                </InlineStack>
                <Divider />

                {(() => {
                  // Einmal definiert, von Header + allen Zeilen verwendet
                  const cols = "32px 1fr 85px 95px 80px 80px 50px 32px";

                  const cellStyle = (align = "left") => ({
                    fontSize: 13,
                    textAlign: align,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  });

                  return (
                    <BlockStack gap="0">
                      {/* ── Header ── */}
                      <div style={{
                        display: "grid", gridTemplateColumns: cols,
                        gap: 8, alignItems: "center",
                        padding: "0 4px 6px",
                        borderBottom: "1px solid var(--p-color-border-subdued)",
                      }}>
                        <div />
                        <Text variant="bodySm" tone="subdued">Variante</Text>
                        <Text variant="bodySm" tone="subdued">SKU</Text>
                        <Text variant="bodySm" tone="subdued">Barcode</Text>
                        <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Preis</Text></div>
                        <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Vgl.preis</Text></div>
                        <div style={{ textAlign: "right" }}><Text variant="bodySm" tone="subdued">Lager</Text></div>
                        <div />
                      </div>

                      {/* ── Zeilen ── */}
                      {localVariants.map((v) => {
                        const isSale = v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price);
                        const isEditing = editingVariantId === v.id;
                        const outOfStock = (v.inventoryQuantity ?? 0) === 0;

                        return (
                          <div key={v.id} style={{
                            borderBottom: "1px solid var(--p-color-border-subdued)",
                            background: outOfStock && !isEditing ? "#fff7ed" : "transparent",
                          }}>
                            {/* Display-Zeile */}
                            <div style={{
                              display: "grid", gridTemplateColumns: cols,
                              gap: 8, alignItems: "center",
                              padding: "8px 4px",
                            }}>
                              {/* Bild — immer anzeigen, Fallback auf featuredImage */}
                              <div style={{
                                width: 32, height: 32, borderRadius: 4, overflow: "hidden",
                                border: "1px solid var(--p-color-border)",
                                background: "var(--p-color-bg-surface-secondary)", flexShrink: 0,
                              }}>
                                {(v.image?.url ?? product.featuredImage?.url)
                                  ? <img src={v.image?.url ?? product.featuredImage?.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  : <div style={{ width: "100%", height: "100%" }} />}
                              </div>

                              {/* Variante */}
                              <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                                <span style={{ ...cellStyle(), color: outOfStock ? "#f97316" : "inherit" }}>
                                  {hasVariants ? v.title : "Standard"}
                                </span>
                                {outOfStock && <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>}
                                {isSale && <span style={{ fontSize: "9px", background: "#fee2e2", color: "#dc2626", borderRadius: 3, padding: "1px 4px", flexShrink: 0 }}>SALE</span>}
                              </div>

                              {/* SKU */}
                              <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>
                                {v.sku || "—"}
                              </span>

                              {/* Barcode */}
                              <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>
                                {v.barcode || "—"}
                              </span>

                              {/* Preis */}
                              <div style={{ textAlign: "right" }}>
                                {isSale && (
                                  <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through", lineHeight: 1.2 }}>
                                    €{parseFloat(v.compareAtPrice).toFixed(2)}
                                  </div>
                                )}
                                <span style={{ fontSize: 13, color: isSale ? "#dc2626" : "inherit" }}>
                                  €{parseFloat(v.price).toFixed(2)}
                                </span>
                              </div>

                              {/* Vgl.preis */}
                              <span style={{ ...cellStyle("right"), color: "var(--p-color-text-secondary)", textDecoration: isSale ? "line-through" : "none" }}>
                                {v.compareAtPrice ? `€${parseFloat(v.compareAtPrice).toFixed(2)}` : "—"}
                              </span>

                              {/* Lager */}
                              <span style={{ ...cellStyle("right"), color: outOfStock ? "#f97316" : "var(--p-color-text-secondary)" }}>
                                {v.inventoryQuantity ?? 0}
                              </span>

                              {/* Edit-Toggle */}
                              <button
                                onClick={() => isEditing ? setEditingVariantId(null) : openVariantEdit(v)}
                                style={{
                                  background: isEditing ? "var(--p-color-bg-fill-brand)" : "transparent",
                                  border: "1px solid var(--p-color-border)",
                                  borderRadius: 4, cursor: "pointer",
                                  width: 28, height: 28,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  padding: 0,
                                }}
                                title={isEditing ? "Schließen" : "Bearbeiten"}
                              >
                                <Icon source={isEditing ? XIcon : EditIcon} tone={isEditing ? "base" : "subdued"} />
                              </button>
                            </div>

                            {/* Edit-Panel */}
                            {isEditing && (
                              <div style={{
                                padding: "12px 8px 16px",
                                borderTop: "1px solid var(--p-color-border-subdued)",
                                background: "var(--p-color-bg-surface-secondary)",
                              }}>
                                <BlockStack gap="300">
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                    <TextField label="Preis (€)" value={variantDraft.price} onChange={val => setVariantDraft(d => ({ ...d, price: val }))} type="number" autoComplete="off" />
                                    <TextField label="Vergleichspreis (€)" value={variantDraft.compareAtPrice} onChange={val => setVariantDraft(d => ({ ...d, compareAtPrice: val }))} type="number" autoComplete="off" placeholder="leer = kein SALE" />
                                    <TextField label="Lagerbestand" value={variantDraft.inventoryQuantity} onChange={val => setVariantDraft(d => ({ ...d, inventoryQuantity: val }))} type="number" autoComplete="off" />
                                  </div>
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                                    <TextField label="SKU" value={variantDraft.sku} onChange={val => setVariantDraft(d => ({ ...d, sku: val }))} autoComplete="off" />
                                    <TextField label="Barcode" value={variantDraft.barcode} onChange={val => setVariantDraft(d => ({ ...d, barcode: val }))} autoComplete="off" />
                                  </div>
                                  <InlineStack gap="200">
                                    <Button variant="primary" size="slim" onClick={() => handleVariantSave(v)} loading={isSaving}>Speichern</Button>
                                    <Button size="slim" onClick={() => setEditingVariantId(null)}>Abbrechen</Button>
                                  </InlineStack>
                                </BlockStack>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </BlockStack>
                  );
                })()}
              </BlockStack>
            </Card>

          </BlockStack>
        </Layout.Section>

      </Layout>

      {/* ── Delete Modal ── */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Produkt löschen"
        primaryAction={{ content: "Löschen", destructive: true, onAction: handleDelete }}
        secondaryActions={[{ content: "Abbrechen", onAction: () => setDeleteModalOpen(false) }]}
      >
        <Modal.Section>
          <Text>Wirklich löschen: <strong>{product.title}</strong>? Diese Aktion kann nicht rückgängig gemacht werden.</Text>
        </Modal.Section>
      </Modal>

    </Page>
  );
}