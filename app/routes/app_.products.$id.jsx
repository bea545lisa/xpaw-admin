import { useLoaderData, useNavigate, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page, Layout, Card, BlockStack, Text, Button, InlineStack,
  Badge, Divider, TextField, Box, Spinner, Modal, Icon, Tabs,
} from "@shopify/polaris";
import { EditIcon, XIcon } from "@shopify/polaris-icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// ─── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const shop = requestUrl.searchParams.get("shop");

  const res = await admin.graphql(`
    query getProduct($id: ID!) {
      product(id: $id) {
        id title handle status description vendor productType createdAt updatedAt tags
        seo { title description }
        featuredImage { url altText }
        images(first: 10) {
          edges { node { id url altText } }
        }
        collections(first: 20) {
          edges { node { id title } }
        }
        options { id name values }
        metafields(first: 20) {
          edges { node { id namespace key type value } }
        }
        variants(first: 50) {
          edges {
            node {
              id title price compareAtPrice
              inventoryQuantity barcode sku
              selectedOptions { name value }
              image { url altText }
              inventoryItem { id requiresShipping tracked }
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

  let allVendors = [];
  let allProductTypes = [];
  try {
    const metaRes = await admin.graphql(`
      query {
        products(first: 100) {
          nodes {
            vendor
            productType
          }
        }
      }
    `);
    const metaJson = await metaRes.json();
    const nodes = metaJson.data?.products?.nodes ?? [];
    allVendors = [...new Set(nodes.map((node) => node.vendor).filter(Boolean))].sort();
    allProductTypes = [...new Set(nodes.map((node) => node.productType).filter(Boolean))].sort();
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  let allCollections = [];
  try {
    const collectionsRes = await admin.graphql(`
      query {
        collections(first: 250) {
          edges {
            node {
              id
              title
              image { url altText }
            }
          }
        }
      }
    `);
    const collectionsJson = await collectionsRes.json();
    allCollections = collectionsJson.data?.collections?.edges?.map((edge) => edge.node) ?? [];
  } catch (e) { /* falls API nicht verfügbar: leer */ }

  // Lager-Location (erste Location)
  const locRes = await admin.graphql(`query { locations(first: 1) { edges { node { id } } } }`);
  const locJson = await locRes.json();
  const locationId = locJson.data.locations.edges[0]?.node?.id ?? null;

  return { product: data.data.product, allTags, allVendors, allProductTypes, allCollections, locationId, shop };
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

  if (type === "updateOrganization") {
    const res = await admin.graphql(`
      mutation($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            vendor
            productType
          }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        input: {
          id: formData.get("id"),
          vendor: formData.get("vendor") || null,
          productType: formData.get("productType") || null,
        },
      },
    });
    const data = await res.json();
    return {
      ok: true,
      type: "updateOrganization",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
  }

  if (type === "updateSeo") {
    const product = {
      id: formData.get("id"),
      handle: formData.get("handle") || null,
      seo: {
        title: formData.get("seoTitle") || null,
        description: formData.get("seoDescription") || null,
      },
    };

    const res = await admin.graphql(`
      mutation($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          userErrors { field message }
          product {
            id
            handle
            seo { title description }
          }
        }
      }
    `, { variables: { product } });

    const data = await res.json();
    return {
      ok: true,
      type: "updateSeo",
      product: data?.data?.productUpdate?.product ?? null,
      userErrors: data?.data?.productUpdate?.userErrors ?? [],
    };
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
const STOCK_TONE = { healthy: "success", low: "warning", out: "critical" };
const STOCK_LABEL = { healthy: "In Ordnung", low: "Niedrig", out: "Ausverkauft" };

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function getVariantStockState(quantity) {
  const stock = Number(quantity) || 0;
  if (stock <= 0) return { key: "out", label: STOCK_LABEL.out, tone: STOCK_TONE.out };
  if (stock <= 5) return { key: "low", label: STOCK_LABEL.low, tone: STOCK_TONE.low };
  return { key: "healthy", label: STOCK_LABEL.healthy, tone: STOCK_TONE.healthy };
}

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
  const { product, allTags = [], allVendors = [], allProductTypes = [], allCollections = [], locationId, shop } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.from ?? `/app/products${location.search}`;
  const fetcher = useFetcher();
  const collectionFetcher = useFetcher();
  const collectionSearchFetcher = useFetcher();

  // ── Refs für Portal-Dropdowns ──
  const collectionInputRef = useRef(null);
  const tagInputRef = useRef(null);
  const vendorInputRef = useRef(null);
  const typeInputRef = useRef(null);

  // ── Basis-State ──
  const [selectedImage, setSelectedImage] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // ── Beschreibung ──
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(product.description ?? "");

  // ── SEO ──
  const [seoDraft, setSeoDraft] = useState({
    seoTitle: product.seo?.title ?? product.title ?? "",
    seoDescription: product.seo?.description ?? "",
    handle: product.handle ?? "",
  });
  const [seoDirty, setSeoDirty] = useState(false);

  // ── Organisation ──
  const [organizationDraft, setOrganizationDraft] = useState({
    vendor: product.vendor ?? "",
    productType: product.productType ?? "",
  });
  const [organizationDirty, setOrganizationDirty] = useState(false);

  // ── Tags ──
  const [localTags, setLocalTags] = useState(product.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [showTagSuggestions, setShowTagSuggestions] = useState(false);
  const [showTagSearch, setShowTagSearch] = useState(false);
  const [showVendorSearch, setShowVendorSearch] = useState(false);
  const [showTypeSearch, setShowTypeSearch] = useState(false);

  // ── Collections ──
  const initCollections = product.collections?.edges?.map(e => e.node) ?? [];
  const [localCollections, setLocalCollections] = useState(initCollections);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [collectionResults, setCollectionResults] = useState([]);
  const [showCollectionSearch, setShowCollectionSearch] = useState(false);
  const [selectedDetailTab, setSelectedDetailTab] = useState(0);

  // ── Varianten (lokaler State für optimistic UI) ──
  const [localVariants, setLocalVariants] = useState(
    product.variants?.edges?.map(e => e.node) ?? []
  );

  const images = product.images?.edges?.map(e => e.node) ?? [];
  const metafields = product.metafields?.edges?.map(e => e.node) ?? [];
  const hasVariants = localVariants.length > 1 || localVariants[0]?.title !== "Default Title";
  const defaultVariant = localVariants.length === 1 && localVariants[0]?.title === "Default Title" ? localVariants[0] : null;
  const totalStock = localVariants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0);
  const hasZeroStock = localVariants.some(v => (v.inventoryQuantity ?? 0) === 0);
  const variantStockRows = localVariants.map((variant) => {
    const stock = Number(variant.inventoryQuantity) || 0;
    const stockState = getVariantStockState(stock);
    return {
      ...variant,
      stock,
      stockState,
      isSale: variant.compareAtPrice && parseFloat(variant.compareAtPrice) > parseFloat(variant.price),
    };
  });

  const isSaving = fetcher.state !== "idle";

  const vendorSuggestions = organizationDraft.vendor.length > 0
    ? allVendors.filter((v) => v.toLowerCase().includes(organizationDraft.vendor.toLowerCase())).slice(0, 8)
    : allVendors.slice(0, 8);
  const productTypeSuggestions = organizationDraft.productType.length > 0
    ? allProductTypes.filter((v) => v.toLowerCase().includes(organizationDraft.productType.toLowerCase())).slice(0, 8)
    : allProductTypes.slice(0, 8);

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
    if (fetcher.data?.type === "updateSeo" && fetcher.data?.product) {
      const next = fetcher.data.product;
      setSeoDraft({
        seoTitle: next.seo?.title ?? "",
        seoDescription: next.seo?.description ?? "",
        handle: next.handle ?? "",
      });
      setSeoDirty(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (fetcher.data?.type === "updateOrganization" && fetcher.data?.product) {
      const next = fetcher.data.product;
      setOrganizationDraft({
        vendor: next.vendor ?? "",
        productType: next.productType ?? "",
      });
      setOrganizationDirty(false);
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (!collectionFetcher.data) return;
    const d = collectionFetcher.data;
    if (d.type === "addToCollection") {
      if (d.collection) {
        setLocalCollections(prev =>
          prev.find(c => c.id === d.collection.id) ? prev : [...prev, d.collection]
        );
      }
    } else if (d.type === "removeFromCollection") {
      setLocalCollections(prev => prev.filter(c => c.id !== d.collectionId));
    }
  }, [collectionFetcher.data]);

  useEffect(() => {
    if (collectionSearchFetcher.data?.type === "searchCollections") {
      setCollectionResults(collectionSearchFetcher.data.collections ?? []);
    }
  }, [collectionSearchFetcher.data]);

  useEffect(() => {
    if (!showCollectionSearch) return;
    const t = setTimeout(() => {
      collectionSearchFetcher.submit(
        { action: "searchCollections", query: collectionSearch },
        { method: "POST" }
      );
    }, collectionSearch.trim().length > 0 ? 250 : 0);
    return () => clearTimeout(t);
  }, [collectionSearch, showCollectionSearch, collectionSearchFetcher]);

  // ── Handler ──
  const handleDelete = () => {
    fetcher.submit({ action: "delete", id: product.id }, { method: "POST" });
    setDeleteModalOpen(false);
    navigate(returnTo);
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
    const safePrice = variantDraft.price ?? String(v.price ?? "");
    const safeCompareAtPrice = variantDraft.compareAtPrice ?? "";
    const safeSku = variantDraft.sku ?? "";
    const safeBarcode = variantDraft.barcode ?? "";
    const safeQuantity = String(isNaN(qty) ? (v.inventoryQuantity ?? 0) : qty);
    fetcher.submit({
      action: "updateVariantAll",
      productId: product.id,
      variantId: v.id,
      price: safePrice,
      compareAtPrice: safeCompareAtPrice,
      sku: safeSku,
      barcode: safeBarcode,
      quantity: safeQuantity,
      inventoryItemId: v.inventoryItem?.id ?? "",
      locationId: locationId ?? "",
    }, { method: "POST" });
    setLocalVariants(prev => prev.map(lv => lv.id === v.id ? {
      ...lv,
      price: safePrice,
      compareAtPrice: safeCompareAtPrice || null,
      sku: safeSku,
      barcode: safeBarcode,
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

  const handleSeoSave = () => {
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
  };

  const handleOrganizationSave = () => {
    fetcher.submit(
      {
        action: "updateOrganization",
        id: product.id,
        vendor: organizationDraft.vendor,
        productType: organizationDraft.productType,
      },
      { method: "POST" }
    );
  };

  const previewUrl = getProductPreviewUrl(shop, seoDraft.handle);
  const detailTabs = [
    { id: "variants", content: `Varianten${localVariants.length ? ` (${localVariants.length})` : ""}` },
    { id: "shipping", content: "Shipping" },
    { id: "metafields", content: "Metafields" },
  ];

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
    setLocalCollections((prev) => {
      if (prev.find((collection) => collection.id === col.id)) return prev;
      return [...prev, col];
    });
    collectionFetcher.submit(
      { action: "addToCollection", collectionId: col.id, collectionTitle: col.title, productId: product.id },
      { method: "POST" }
    );
    setCollectionSearch("");
  };

  const handleCollectionSelect = (selected) => {
    const selectedIds = Array.isArray(selected) ? selected : [selected];
    const nextCollections = collectionResults.filter(
      (collection) =>
        selectedIds.includes(collection.id) &&
        !localCollections.find((localCollection) => localCollection.id === collection.id)
    );

    nextCollections.forEach((collection) => {
      handleCollectionAdd(collection);
    });

    setCollectionSearch("");
    setShowCollectionSearch(false);
  };

  const filteredCollectionSuggestions = collectionResults
    .filter((collection) =>
      !localCollections.find((localCollection) => localCollection.id === collection.id)
    );

  const handleCollectionRemove = (colId) => {
    setLocalCollections(prev => prev.filter(c => c.id !== colId));
    collectionFetcher.submit(
      { action: "removeFromCollection", collectionId: colId, productId: product.id },
      { method: "POST" }
    );
  };

  return (
    <Page
      fullWidth
      title={product.title}
      titleMetadata={<Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge>}
      backAction={{ onAction: () => navigate(returnTo) }}
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

            {/* ── Varianten-Detail-Stock-View ── */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingSm">Varianten-Detail-Stock-View</Text>
                  <Text tone="subdued" variant="bodySm">{variantStockRows.length} Varianten</Text>
                </InlineStack>
                <Divider />

                <div style={{ display: "grid", gap: 10 }}>
                  {variantStockRows.map((variant) => (
                    <div
                      key={variant.id}
                      style={{
                        display: "grid",
                        gap: 10,
                        padding: "12px",
                        borderRadius: 8,
                        border: "1px solid var(--p-color-border-subdued)",
                        background: variant.stockState.key === "out"
                          ? "var(--p-color-bg-surface-secondary)"
                          : "var(--p-color-bg-surface)",
                      }}
                    >
                      <InlineStack align="space-between" blockAlign="start" wrap>
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Text variant="bodySm" fontWeight="semibold">{variant.title || "Standard"}</Text>
                            <Badge tone={variant.stockState.tone}>{variant.stockState.label}</Badge>
                            {variant.isSale && <Badge tone="success">SALE</Badge>}
                          </InlineStack>
                          <Text variant="bodySm" tone="subdued">
                            SKU: {variant.sku || "—"} · Barcode: {variant.barcode || "—"}
                          </Text>
                        </BlockStack>
                        <BlockStack gap="050" align="end">
                          <Text variant="headingSm">{variant.stock}</Text>
                          <Text variant="bodySm" tone="subdued">Einheiten</Text>
                        </BlockStack>
                      </InlineStack>

                      <div style={{ height: 8, borderRadius: 999, background: "var(--p-color-bg-surface-secondary)", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, Math.max(8, variant.stock * 12))}%`,
                            height: "100%",
                            borderRadius: 999,
                            background:
                              variant.stockState.key === "out"
                                ? "var(--p-color-text-critical)"
                                : variant.stockState.key === "low"
                                  ? "var(--p-color-text-warning)"
                                  : "var(--p-color-text-success)",
                            transition: "width 160ms ease",
                          }}
                        />
                      </div>

                      <InlineStack align="space-between" blockAlign="center" wrap>
                        <Text variant="bodySm" tone="subdued">
                          Preis: €{parseFloat(variant.price).toFixed(2)}
                        </Text>
                        <Text variant="bodySm" tone={variant.stockState.key === "out" ? "critical" : undefined}>
                          {variant.stockState.key === "out"
                            ? "Diese Variante ist ausverkauft"
                            : variant.stockState.key === "low"
                              ? "Nachbestellen prüfen"
                              : "Bestand ist gesund"}
                        </Text>
                      </InlineStack>
                    </div>
                  ))}
                </div>
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

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text variant="headingSm">SEO</Text>
                    <Text variant="bodySm" tone="subdued">
                      Titel, Description und Handle mit Live-Vorschau.
                    </Text>
                  </BlockStack>
                  <Button
                    variant="primary"
                    size="slim"
                    loading={fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateSeo"}
                    onClick={handleSeoSave}
                    disabled={!seoDirty}
                  >
                    Speichern
                  </Button>
                </InlineStack>
                <Divider />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <TextField
                    label="SEO Titel"
                    value={seoDraft.seoTitle}
                    onChange={(value) => {
                      setSeoDraft((prev) => ({ ...prev, seoTitle: value }));
                      setSeoDirty(true);
                    }}
                    autoComplete="off"
                    maxLength={70}
                    showCharacterCount
                    helpText="Empfohlen: bis 60 Zeichen"
                  />

                  <TextField
                    label="URL Handle"
                    value={seoDraft.handle}
                    onChange={(value) => {
                      setSeoDraft((prev) => ({ ...prev, handle: slugifyHandle(value) }));
                      setSeoDirty(true);
                    }}
                    autoComplete="off"
                    helpText="Nur Kleinbuchstaben, Zahlen und Bindestriche"
                  />

                  <TextField
                    label="Meta Description"
                    value={seoDraft.seoDescription}
                    onChange={(value) => {
                      setSeoDraft((prev) => ({ ...prev, seoDescription: value }));
                      setSeoDirty(true);
                    }}
                    autoComplete="off"
                    multiline={4}
                    maxLength={160}
                    showCharacterCount
                    helpText="Empfohlen: bis 155 Zeichen"
                  />

                  <div
                    style={{
                      display: "grid",
                      gap: 10,
                      border: "1px solid var(--p-color-border-subdued)",
                      borderRadius: 8,
                      background: "var(--p-color-bg-surface-secondary)",
                      padding: 16,
                      minWidth: 0,
                    }}
                  >
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
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text variant="headingSm">Organisation</Text>
                    <Text variant="bodySm" tone="subdued">
                      Collections und Tags als Pills, Vendor und Produkttyp darunter.
                    </Text>
                  </BlockStack>
                  <Button
                    variant="primary"
                    size="slim"
                    loading={fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateOrganization"}
                    onClick={handleOrganizationSave}
                    disabled={!organizationDirty}
                  >
                    Speichern
                  </Button>
                </InlineStack>
                <Divider />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <BlockStack gap="200">
                    <Text variant="bodySm" fontWeight="semibold">Collections</Text>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {localCollections.map((c) => (
                        <span
                          key={c.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface-secondary)",
                            fontSize: 12,
                            lineHeight: 1,
                          }}
                        >
                          {c.title}
                          <button
                            onClick={() => handleCollectionRemove(c.id)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                              color: "var(--p-color-text-subdued)",
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <Button size="micro" onClick={() => {
                        setShowCollectionSearch(true);
                        collectionSearchFetcher.submit(
                          { action: "searchCollections", query: "" },
                          { method: "POST" }
                        );
                      }}>
                        +
                      </Button>
                    </div>
                    {showCollectionSearch && (
                      <div style={{ position: "relative" }}>
                        <div ref={collectionInputRef}>
                          <TextField
                            label="" labelHidden
                            placeholder="Collection suchen…"
                            value={collectionSearch}
                            onChange={setCollectionSearch}
                            autoComplete="off"
                            onFocus={() => setShowCollectionSearch(true)}
                            onBlur={() => setTimeout(() => setShowCollectionSearch(false), 150)}
                          />
                        </div>
                        <PositionedDropdown
                          anchorRef={collectionInputRef}
                          open={showCollectionSearch}
                        >
                          {filteredCollectionSuggestions.length > 0 ? (
                            filteredCollectionSuggestions.map((collection) => (
                              <div
                                key={collection.id}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleCollectionAdd(collection);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  cursor: "pointer",
                                  fontSize: 13,
                                  borderBottom: "1px solid var(--p-color-border-subdued)",
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = "var(--p-color-bg-surface-hover)"}
                                onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                              >
                                {collection.title}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: 12 }}>
                              <Text variant="bodySm" tone="subdued">
                                Keine Collections gefunden
                              </Text>
                            </div>
                          )}
                        </PositionedDropdown>
                      </div>
                    )}
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="bodySm" fontWeight="semibold">Tags</Text>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      {localTags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "5px 10px",
                            borderRadius: 999,
                            border: "1px solid var(--p-color-border)",
                            background: "var(--p-color-bg-surface-secondary)",
                            fontSize: 12,
                            lineHeight: 1,
                          }}
                        >
                          {tag}
                          <button
                            onClick={() => handleTagRemove(tag)}
                            style={{
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              padding: 0,
                              color: "var(--p-color-text-subdued)",
                            }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                      <Button size="micro" onClick={() => { setShowTagSearch(true); setShowTagSuggestions(true); }}>
                        +
                      </Button>
                    </div>
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
                              onBlur={() => setTimeout(() => {
                                setShowTagSuggestions(false);
                                setShowTagSearch(false);
                              }, 150)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { handleTagAdd(); setShowTagSuggestions(false); setShowTagSearch(false); }
                                if (e.key === "Escape") { setShowTagSearch(false); setShowTagSuggestions(false); }
                              }}
                            />
                          </div>
                          <Button onClick={() => { handleTagAdd(); setShowTagSuggestions(false); setShowTagSearch(false); }} disabled={!tagInput.trim()}>+</Button>
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
                </div>

                <Divider />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
                  <BlockStack gap="200">
                    <Text variant="bodySm" fontWeight="semibold">Vendor</Text>
                    <div style={{ position: "relative" }}>
                      <div ref={vendorInputRef}>
                        <TextField
                          label="" labelHidden
                          value={organizationDraft.vendor}
                          onChange={(value) => {
                            setOrganizationDraft((prev) => ({ ...prev, vendor: value }));
                            setOrganizationDirty(true);
                          }}
                          onFocus={() => setShowVendorSearch(true)}
                          onBlur={() => setTimeout(() => setShowVendorSearch(false), 150)}
                          autoComplete="off"
                          placeholder="Vendor wählen"
                        />
                      </div>
                      <PositionedDropdown anchorRef={vendorInputRef} open={showVendorSearch && vendorSuggestions.length > 0}>
                        {vendorSuggestions.map((vendor) => (
                          <div
                            key={vendor}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setOrganizationDraft((prev) => ({ ...prev, vendor }));
                              setOrganizationDirty(true);
                              setShowVendorSearch(false);
                            }}
                            style={{
                              padding: "8px 12px", cursor: "pointer", fontSize: 13,
                              borderBottom: "1px solid var(--p-color-border-subdued)",
                            }}
                          >
                            {vendor}
                          </div>
                        ))}
                      </PositionedDropdown>
                    </div>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="bodySm" fontWeight="semibold">Produkttyp</Text>
                    <div style={{ position: "relative" }}>
                      <div ref={typeInputRef}>
                        <TextField
                          label="" labelHidden
                          value={organizationDraft.productType}
                          onChange={(value) => {
                            setOrganizationDraft((prev) => ({ ...prev, productType: value }));
                            setOrganizationDirty(true);
                          }}
                          onFocus={() => setShowTypeSearch(true)}
                          onBlur={() => setTimeout(() => setShowTypeSearch(false), 150)}
                          autoComplete="off"
                          placeholder="Produkttyp wählen"
                        />
                      </div>
                      <PositionedDropdown anchorRef={typeInputRef} open={showTypeSearch && productTypeSuggestions.length > 0}>
                        {productTypeSuggestions.map((productType) => (
                          <div
                            key={productType}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setOrganizationDraft((prev) => ({ ...prev, productType }));
                              setOrganizationDirty(true);
                              setShowTypeSearch(false);
                            }}
                            style={{
                              padding: "8px 12px", cursor: "pointer", fontSize: 13,
                              borderBottom: "1px solid var(--p-color-border-subdued)",
                            }}
                          >
                            {productType}
                          </div>
                        ))}
                      </PositionedDropdown>
                    </div>
                  </BlockStack>
                </div>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Tabs tabs={detailTabs} selected={selectedDetailTab} onSelect={setSelectedDetailTab} />
              </BlockStack>
            </Card>

            {selectedDetailTab === 0 ? (
              <>
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

                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="headingSm">
                        {hasVariants ? `Varianten (${localVariants.length})` : "Preis & Lager"}
                      </Text>
                      {isSaving && <Spinner size="small" />}
                    </InlineStack>
                    <Divider />

                    {!hasVariants && defaultVariant ? (
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <InlineStack gap="200" blockAlign="center" wrap>
                            <Text variant="bodySm" fontWeight="semibold">Standard</Text>
                            <Badge tone={getVariantStockState(defaultVariant.inventoryQuantity).tone}>
                              {getVariantStockState(defaultVariant.inventoryQuantity).label}
                            </Badge>
                          </InlineStack>
                          <Text tone="subdued" variant="bodySm">
                            SKU: {defaultVariant.sku || "—"} · Barcode: {defaultVariant.barcode || "—"}
                          </Text>
                        </InlineStack>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                          <TextField
                            label="Preis (€)"
                            value={variantDraft.price || String(defaultVariant.price ?? "")}
                            onChange={(val) => setVariantDraft((draft) => ({ ...draft, price: val }))}
                            type="number"
                            autoComplete="off"
                          />
                          <TextField
                            label="Vergleichspreis (€)"
                            value={variantDraft.compareAtPrice || String(defaultVariant.compareAtPrice ?? "")}
                            onChange={(val) => setVariantDraft((draft) => ({ ...draft, compareAtPrice: val }))}
                            type="number"
                            autoComplete="off"
                            placeholder="leer = kein SALE"
                          />
                          <TextField
                            label="Lagerbestand"
                            value={variantDraft.inventoryQuantity || String(defaultVariant.inventoryQuantity ?? 0)}
                            onChange={(val) => setVariantDraft((draft) => ({ ...draft, inventoryQuantity: val }))}
                            type="number"
                            autoComplete="off"
                          />
                          <TextField
                            label="SKU"
                            value={variantDraft.sku || String(defaultVariant.sku ?? "")}
                            onChange={(val) => setVariantDraft((draft) => ({ ...draft, sku: val }))}
                            autoComplete="off"
                          />
                          <TextField
                            label="Barcode"
                            value={variantDraft.barcode || String(defaultVariant.barcode ?? "")}
                            onChange={(val) => setVariantDraft((draft) => ({ ...draft, barcode: val }))}
                            autoComplete="off"
                          />
                        </div>

                        <InlineStack gap="200">
                          <Button
                            variant="primary"
                            size="slim"
                            onClick={() => handleVariantSave(defaultVariant)}
                            loading={isSaving}
                          >
                            Speichern
                          </Button>
                          <Button
                            size="slim"
                            onClick={() => setVariantDraft({
                              price: String(defaultVariant.price ?? ""),
                              compareAtPrice: String(defaultVariant.compareAtPrice ?? ""),
                              inventoryQuantity: String(defaultVariant.inventoryQuantity ?? 0),
                              sku: defaultVariant.sku ?? "",
                              barcode: defaultVariant.barcode ?? "",
                            })}
                          >
                            Zurücksetzen
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    ) : (
                      (() => {
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

                            {localVariants.map((v) => {
                              const isSale = v.compareAtPrice && parseFloat(v.compareAtPrice) > parseFloat(v.price);
                              const isEditing = editingVariantId === v.id;
                              const outOfStock = (v.inventoryQuantity ?? 0) === 0;

                              return (
                                <div key={v.id} style={{
                                  borderBottom: "1px solid var(--p-color-border-subdued)",
                                  background: outOfStock && !isEditing ? "#fff7ed" : "transparent",
                                }}>
                                  <div style={{
                                    display: "grid", gridTemplateColumns: cols,
                                    gap: 8, alignItems: "center",
                                    padding: "8px 4px",
                                  }}>
                                    <div style={{
                                      width: 32, height: 32, borderRadius: 4, overflow: "hidden",
                                      border: "1px solid var(--p-color-border)",
                                      background: "var(--p-color-bg-surface-secondary)", flexShrink: 0,
                                    }}>
                                      {(v.image?.url ?? product.featuredImage?.url)
                                        ? <img src={v.image?.url ?? product.featuredImage?.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                        : <div style={{ width: "100%", height: "100%" }} />}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                                      <span style={{ ...cellStyle(), color: outOfStock ? "#f97316" : "inherit" }}>
                                        {hasVariants ? v.title : "Standard"}
                                      </span>
                                      {outOfStock && <span style={{ fontSize: 11, flexShrink: 0 }}>⚠</span>}
                                      {isSale && <span style={{
                                        fontSize: "10px",
                                        background: "#fee2e2",
                                        color: "#dc2626",
                                        borderRadius: 999,
                                        padding: "3px 8px",
                                        fontWeight: 600,
                                        letterSpacing: "0.3px",
                                        flexShrink: 0
                                      }}>SALE</span>}
                                    </div>

                                    <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>
                                      {v.sku || "—"}
                                    </span>

                                    <span style={{ ...cellStyle(), color: "var(--p-color-text-secondary)" }}>
                                      {v.barcode || "—"}
                                    </span>

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

                                    <span style={{ ...cellStyle("right"), color: "var(--p-color-text-secondary)", textDecoration: isSale ? "line-through" : "none" }}>
                                      {v.compareAtPrice ? `€${parseFloat(v.compareAtPrice).toFixed(2)}` : "—"}
                                    </span>

                                    <span style={{ ...cellStyle("right"), color: outOfStock ? "#f97316" : "var(--p-color-text-secondary)" }}>
                                      {v.inventoryQuantity ?? 0}
                                    </span>

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
                      })()
                    )}
                  </BlockStack>
                </Card>
              </>
            ) : selectedDetailTab === 1 ? (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm">Shipping</Text>
                    <Text variant="bodySm" tone="subdued">Versand pro Variante</Text>
                  </InlineStack>
                  <Divider />
                  <BlockStack gap="200">
                    {localVariants.map((variant) => (
                      <div
                        key={variant.id}
                        style={{
                          display: "grid",
                          gap: 8,
                          padding: 12,
                          borderRadius: 8,
                          border: "1px solid var(--p-color-border-subdued)",
                        }}
                      >
                        <InlineStack align="space-between" blockAlign="center" wrap>
                          <Text variant="bodySm" fontWeight="semibold">{variant.title || "Standard"}</Text>
                          <Badge tone={variant.inventoryItem?.requiresShipping ? "success" : "warning"}>
                            {variant.inventoryItem?.requiresShipping ? "Versand erforderlich" : "Kein Versand"}
                          </Badge>
                        </InlineStack>
                        <Text variant="bodySm" tone="subdued">
                          {variant.inventoryItem?.tracked ? "Inventar wird verfolgt" : "Inventar wird nicht verfolgt"}
                        </Text>
                      </div>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingSm">Metafields</Text>
                    <Text variant="bodySm" tone="subdued">{metafields.length} Einträge</Text>
                  </InlineStack>
                  <Divider />
                  {metafields.length > 0 ? (
                    <BlockStack gap="200">
                      {metafields.map((field) => (
                        <div
                          key={field.id}
                          style={{
                            display: "grid",
                            gap: 4,
                            padding: 12,
                            borderRadius: 8,
                            border: "1px solid var(--p-color-border-subdued)",
                          }}
                        >
                          <Text variant="bodySm" fontWeight="semibold">
                            {field.namespace}.{field.key}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {field.type}
                          </Text>
                          <Text variant="bodySm">{field.value || "—"}</Text>
                        </div>
                      ))}
                    </BlockStack>
                  ) : (
                    <Text tone="subdued" variant="bodySm">Keine Metafields hinterlegt</Text>
                  )}
                </BlockStack>
              </Card>
            )}

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
