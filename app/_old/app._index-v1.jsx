import {
  Page, Layout, Card, BlockStack, Button, TextField,
  Toast, Checkbox, InlineStack, Box, Text, Pagination,
} from "@shopify/polaris";
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";
import { authenticate } from "../shopify.server";
import ProductList from "../components/ProductList";
import ProductModal from "../components/ProductModal.jsx";
import MetafieldsModal from "../components/MetafieldsModal";
import { useProduct } from "../hooks/useProduct.jsx";

// ================= LOADER =================

export const loader = async ({ request }) => {

  const { admin } = await authenticate.admin(request);
  const requestUrl  = new URL(request.url);
  const host = requestUrl .searchParams.get("host");
  const shop = requestUrl.searchParams.get("shop");

  let allProducts = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const response = await admin.graphql(`
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          edges {
            cursor
            node {
              id
              title
              status
              featuredImage {
                url
                altText
              }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    price
                    inventoryQuantity
                    inventoryItem { id }
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              options {
                id
                name
                values
                optionValues {
                  id
                  name
                }
              }
              metafields(first: 5) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    `, { variables: { cursor } });

    const json = await response.json();
    const page = json.data.products;

    allProducts = [...allProducts, ...page.edges];
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

    // Location laden
  const locationRes = await admin.graphql(`
    query {
      locations(first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `);
  const locationJson = await locationRes.json();
  const locationId = locationJson.data.locations.edges[0]?.node?.id;

  return { products: allProducts, host, shop, locationId };
};

// ================= ACTION =================

export const action = async ({ request }) => {

  const { admin } = await authenticate.admin(request);

  const {
    createProduct,
    //updateProduct,
    deleteProduct,
    updateProductStatus,
    getProductMetafields,
    updateVariantPrice,
    setVariantInventory,
    updateProductOptions
  } = await import("../services/product.server");

  const formData = await request.formData();
  const type = formData.get("action");

  if (type === "create") {
    return { ok: true, type: "create", product: await createProduct(admin) };
  }

if (type === "update") {

    //const updatedProduct = await updateProduct(admin, formData.get("id"), formData.get("title"));

    // Options speichern
    const options = JSON.parse(formData.get("options") || "[]");
    const validOptions = options.filter(o => o.name.trim() !== "" && o.values.length > 0);
    if (validOptions.length > 0) {
      await updateProductOptions(admin, formData.get("id"), validOptions, validOptions);
    }

    // Produkt neu laden um aktuelle Varianten-IDs zu bekommen
    const refreshRes = await admin.graphql(`
      query($id: ID!) {
        product(id: $id) {
          variants(first: 50) {
            edges {
              node {
                id title price
                inventoryItem { id }
              }
            }
          }
        }
      }
    `, { variables: { id: formData.get("id") } });

    const refreshData = await refreshRes.json();
    const freshVariants = refreshData.data.product.variants.edges.map(e => e.node);

    // Preis/Lager für alle Varianten setzen
    const variantsToUpdate = JSON.parse(formData.get("variants") || "[]");
    await Promise.all(freshVariants.map(async (fv) => {
      const inputVariant = variantsToUpdate.find(v => v.title === fv.title);
      if (!inputVariant) return;
      await updateVariantPrice(admin, formData.get("id"), fv.id, inputVariant.price);
      if (fv.inventoryItem?.id && inputVariant.inventoryQuantity) {
        await setVariantInventory(admin, fv.inventoryItem.id, formData.get("locationId"), inputVariant.inventoryQuantity);
      }
    }));

    // Aktuelles Produkt zurückgeben
    const productRes = await admin.graphql(`
      query getProduct($id: ID!) {
        product(id: $id) {
          id title status
          variants(first: 50) {
            edges {
              node {
                id title price inventoryQuantity
                inventoryItem { id }
                selectedOptions { name value }
              }
            }
          }
          options {
            id name values
            optionValues { id name }
          }
        }
      }
    `, { variables: { id: formData.get("id") } });

    const productData = await productRes.json();
    return {
      ok: true,
      type: "update",
      product: productData.data.product,
    };
  }

  if (type === "delete") {
    return { ok: true, type: "delete", id: await deleteProduct(admin, formData.get("id")) };
  }

  if (type === "bulkDelete") {
    const ids = JSON.parse(formData.get("ids") || "[]");
    await Promise.all(
      ids.map((id) =>
        admin.graphql(
          `mutation ($input: ProductDeleteInput!) {
            productDelete(input: $input) { deletedProductId }
          }`,
          { variables: { input: { id } } }
        )
      )
    );
    return { ok: true, type: "bulkDelete", ids };
  }

  if (type === "updateStatus") {
    return {
      ok: true,
      type: "updateStatus",
      product: await updateProductStatus(
        admin,
        formData.get("id"),
        formData.get("status")
      ),
    };
  }

  // Metafields laden
  if (type === "getMetafields") {
    const metafields = await getProductMetafields(admin, formData.get("productId"));
    return { ok: true, type: "getMetafields", metafields };
  }

  // Metafield speichern (neu oder bearbeiten)
  if (type === "saveMetafield") {
    const product = await admin.graphql(`
      mutation setMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value type }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
          value: formData.get("value"),
          type: formData.get("type"),
        }]
      }
    });

    if (type === "updateVariants") {
      const variants = JSON.parse(formData.get("variants"));
      const locationId = formData.get("locationId");

      await Promise.all(variants.map(async (v) => {

        await updateVariantPrice(admin, v.id, v.price);
        await setVariantInventory(admin, v.inventoryItemId, locationId, v.inventoryQuantity);
      }));

      return { ok: true, type: "updateVariants", variants };
    }

    const data = await product.json();
    return { ok: true, type: "saveMetafield", metafield: data.data.metafieldsSet.metafields[0] };
  }

  // Metafield löschen
  if (type === "deleteMetafield") {
    await admin.graphql(`
      mutation deleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key namespace }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
        }]
      }
    });
    return { ok: true, type: "deleteMetafield", metafieldId: formData.get("metafieldId") };
  }

  return null;
};

// ================= UI =================

const PAGE_SIZE = 50;

export default function Products() {

  const fetcher = useFetcher();
  const { products: initialProducts, host, shop, locationId } = useLoaderData();

  // ===== STATE =====
  const [localProducts, setLocalProducts] = useState(initialProducts);
  const [mode] = useState(initialProducts.length < 100 ? "infinite" : "paginated");
  const [visibleCount, setVisibleCount] = useState(15);
  const [currentPage, setCurrentPage] = useState(0);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteTitle, setDeleteTitle] = useState("");
  const [progress, setProgress] = useState(0);
  const [restoredIds, setRestoredIds] = useState([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [undoTimer, setUndoTimer] = useState(null);
  const [savedForUndo, setSavedForUndo] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL"); // "ALL" | "ACTIVE" | "DRAFT" | "ARCHIVED"
  const [editVariants, setEditVariants] = useState([]);
  const [editOptions, setEditOptions] = useState([]);

  // Metafields State
  const metafieldsFetcher = useFetcher();
  const [metafieldsModalOpen, setMetafieldsModalOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState(null);
  const [metafields, setMetafields] = useState([]);
  const [newMetafield, setNewMetafield] = useState({ namespace: "", key: "", value: "", type: "single_line_text_field" });

 // ===== DERIVED =====
  const filteredProducts = localProducts
    .filter(p => statusFilter === "ALL" || p?.node?.status === statusFilter)
    .filter(p => p?.node?.title?.toLowerCase().includes(query.toLowerCase())
  );

  const visibleProducts = mode === "infinite"
    ? filteredProducts.slice(0, visibleCount)
    : filteredProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const hasMoreInfinite = visibleCount < filteredProducts.length;

  // ===== HOOKS =====
  const { selectedIds, toggleSelect, clearSelection, selectAll } = useProduct();

  // ===== LOADING FLAGS =====
  const isUpdating = fetcher.state !== "idle" && fetcher.formData?.get("action") === "update";
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("action") === "delete";
  const isCreating = fetcher.state !== "idle" && fetcher.formData?.get("action") === "create";

  // ===== HANDLERS =====
  const handleUpdate = () => {
    fetcher.submit(
      {
        action: "update",
        id: editId,          // productId
        title: editValue,
        variants: JSON.stringify(editVariants),
        options: JSON.stringify(editOptions),  // 🔥 neu
        locationId,
      },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    fetcher.submit(
      { action: "delete", id: deleteId },
      { method: "post" }
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === visibleProducts.length) {
      clearSelection();
    } else {
      selectAll(visibleProducts.map(p => p?.node?.id).filter(Boolean));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    const productsToDelete = localProducts.filter(p => idsToDelete.includes(p.node.id));

    setPendingDeleteIds(idsToDelete);
    setSavedForUndo(productsToDelete);
    clearSelection();
    setProgress(100);

    const interval = setInterval(() => setProgress(prev => prev - 20), 1000);

    const timer = setTimeout(() => {
      clearInterval(interval);
      setLocalProducts(prev => prev.filter(p => !idsToDelete.includes(p.node.id)));
      fetcher.submit(
        { action: "bulkDelete", ids: JSON.stringify(idsToDelete) },
        { method: "post" }
      );
      setToast(`${idsToDelete.length} Produkte gelöscht 🗑️`);  // 🔥
      setPendingDeleteIds([]);
      setProgress(0);
    }, 5000);

    setUndoTimer(timer);
  };

  const handleUndo = () => {
    clearTimeout(undoTimer);
    setRestoredIds(pendingDeleteIds);
    setPendingDeleteIds([]);
    setSavedForUndo([]);
    setProgress(0);
    setTimeout(() => setRestoredIds([]), 400);
  };

  // ===== EFFECTS =====
  const prevState = useRef("idle");

  useEffect(() => {
    if (prevState.current !== "idle" && fetcher.state === "idle" && fetcher.data?.ok) {

      const data = fetcher.data;

      if (data.type === "update") {
        setModalOpen(false);
        setEditId(null);
        setEditValue("");
        setLocalProducts(prev =>
          prev.map(p => p.node.id === data.product.id
            ? { node: data.product }
            : p
          )
        );
      }

      if (data.type === "delete") {
        setDeleteModalOpen(false);
        setToast(`Produkt ${deleteTitle} gelöscht 🗑️`);
        setLocalProducts(prev => prev.filter(p => p.node.id !== data.id));
      }

      if (data.type === "create") {
        setToast(`Produkt ${data.product.title} erstellt 🎉`);
        setLocalProducts(prev => [{ node: data.product }, ...prev]);
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state]);

  // ===== METAFIELDS =====
  const prevMetafieldsState = useRef("idle");

  useEffect(() => {
    if (prevMetafieldsState.current !== "idle" && metafieldsFetcher.state === "idle" && metafieldsFetcher.data?.ok) {
      const data = metafieldsFetcher.data;

      if (data.type === "getMetafields") {
        setMetafields(data.metafields);
        setMetafieldsModalOpen(true);
      }
      if (data.type === "saveMetafield") {
        const saved = data.metafield;
        setMetafields(prev => {
          const exists = prev.find(m => m.id === saved.id);
          return exists
            ? prev.map(m => m.id === saved.id ? saved : m)
            : [...prev, saved];
        });
        setNewMetafield({ namespace: "", key: "", value: "", type: "single_line_text_field" });
      }
      if (data.type === "deleteMetafield") {
        setMetafields(prev => prev.filter(m => m.id !== data.metafieldId));
      }
    }
    prevMetafieldsState.current = metafieldsFetcher.state;
  }, [metafieldsFetcher.state]);

  // ===== RENDER =====
  return (
    <>
      {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}

      {pendingDeleteIds.length > 0 && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          background: "#303030", color: "white",
          padding: "12px 16px", borderRadius: 8, width: 260, zIndex: 9999,
        }}>
          <div style={{ marginBottom: 8 }}>
            {pendingDeleteIds.length} wird gelöscht…
          </div>
          <div style={{ height: 4, background: "#555", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              width: `${progress}%`, height: "100%",
              background: "#4ea1ff", transition: "width 1s linear",
            }} />
          </div>
          <button onClick={handleUndo} style={{
            background: "transparent", color: "#4ea1ff", border: "none", cursor: "pointer",
          }}>
            Rückgängig
          </button>
        </div>
      )}

      <Page title={`Produkte (${filteredProducts.length})`}>
        <Layout>
          <Layout.Section>
            <Card paddingInline="300" paddingBlock="100">
              <BlockStack gap="400">

                <ProductModal
                  modalOpen={modalOpen}
                  setModalOpen={setModalOpen}
                  editValue={editValue}
                  setEditValue={setEditValue}
                  variants={editVariants}
                  setEditVariants={setEditVariants}
                  editOptions={editOptions}
                  setEditOptions={setEditOptions}
                  productId={editId}
                  handleUpdate={handleUpdate}
                  isUpdating={isUpdating}
                  deleteModalOpen={deleteModalOpen}
                  setDeleteModalOpen={setDeleteModalOpen}
                  deleteTitle={deleteTitle}
                  handleDelete={handleDelete}
                  isDeleting={isDeleting}
                />

                <MetafieldsModal
                  open={metafieldsModalOpen}
                  onClose={() => setMetafieldsModalOpen(false)}
                  metafields={metafields}
                  newMetafield={newMetafield}
                  setNewMetafield={setNewMetafield}
                  productId={activeProductId}
                  onSave={() => {
                    metafieldsFetcher.submit(
                      {
                        action: "saveMetafield",
                        productId: activeProductId,
                        namespace: newMetafield.namespace,
                        key: newMetafield.key,
                        value: newMetafield.value,
                        type: newMetafield.type,
                      },
                      { method: "post" }
                    );
                  }}
                  onDelete={(metafieldId, namespace, key) => {
                    metafieldsFetcher.submit(
                      {
                        action: "deleteMetafield",
                        metafieldId,
                        productId: activeProductId,
                        namespace,
                        key,
                      },
                      { method: "post" }
                    );
                  }}
                />

                <TextField
                  label="Suche"
                  value={query}
                  onChange={setQuery}
                  autoComplete="off"
                />

                <InlineStack gap="200">
                  {["ALL", "ACTIVE", "DRAFT", "ARCHIVED"].map(status => (
                    <Button
                      key={status}
                      size="slim"
                      pressed={statusFilter === status}
                      onClick={() => setStatusFilter(status)}
                    >
                      {status === "ALL" ? "Alle" : status === "ACTIVE" ? "Aktiv" : status === "DRAFT" ? "Entwurf" : "Archiviert"}
                    </Button>
                  ))}
                </InlineStack>

                <Button
                  loading={isCreating}
                  onClick={() => fetcher.submit({ action: "create" }, { method: "post" })}
                >
                  Produkt erstellen 🚀
                </Button>

                <BlockStack gap="100">
                  <Box paddingInline="200" paddingBlock="0">
                    <BlockStack gap="050">
                      <Checkbox
                        label="Alle auswählen"
                        accessibilityLabel="Alle Produkte auswählen"
                        checked={selectedIds.length > 0 && selectedIds.length === visibleProducts.length}
                        onChange={toggleAll}
                      />
                      {selectedIds.length > 0 && (
                        <InlineStack align="space-between">
                          <Text tone="subdued" variant="bodySm">
                            {selectedIds.length} ausgewählt
                          </Text>
                          <Button tone="critical" size="slim" onClick={handleBulkDelete}>
                            Löschen
                          </Button>
                        </InlineStack>
                      )}
                    </BlockStack>
                  </Box>

                   <style>{`
                    .product-grid {
                      display: grid;
                      grid-template-columns: 1fr 60px auto 220px 90px;
                      gap: 8px;
                      align-items: center;
                      width: 100%;
                    }
                  `}</style>

                  <Box paddingInline="200" paddingBlock="200">
                    <div className="product-grid">
                      <div style={{ paddingLeft: 82 }}>
                        <Text variant="headingSm" tone="subdued">Produkt</Text>
                      </div>
                      <Text variant="headingSm" tone="subdued">Preis</Text>
                      <Text variant="headingSm" tone="subdued">Lager</Text>
                      <div style={{ textAlign: "center" }}>
                        <Text variant="headingSm" tone="subdued">Aktionen</Text>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <Text variant="headingSm" tone="subdued">Status</Text>
                      </div>
                    </div>
                  </Box>

                  <ProductList
                    products={visibleProducts}
                    host={host}
                    setProductList={setLocalProducts}
                    selectedIds={selectedIds}
                    toggleSelect={toggleSelect}
                    setEditId={setEditId}
                    setEditValue={setEditValue}
                    setEditVariants={setEditVariants}
                    setEditOptions={setEditOptions}
                    setModalOpen={setModalOpen}
                    setDeleteId={setDeleteId}
                    setDeleteTitle={setDeleteTitle}
                    setDeleteModalOpen={setDeleteModalOpen}
                    pendingDeleteIds={pendingDeleteIds}
                    restoredIds={restoredIds}
                    onStatusToggle={(id, currentStatus) => {       // 🔥 neu
                      const newStatus = currentStatus === "ACTIVE" ? "DRAFT" : "ACTIVE";
                      fetcher.submit(
                        { action: "updateStatus", id, status: newStatus },
                        { method: "post" }
                      );
                      // Optimistic UI:
                      setLocalProducts(prev =>
                        prev.map(p => p.node.id === id
                          ? { node: { ...p.node, status: newStatus } }
                          : p
                        )
                      );
                    }}
                    onMetafields={(productId) => {
                      setActiveProductId(productId);
                      metafieldsFetcher.submit(
                        { action: "getMetafields", productId },
                        { method: "post" }
                      );
                    }}
                  />

                  {mode === "infinite" && hasMoreInfinite && (
                    <Box paddingBlock="400">
                      <InlineStack align="center">
                        <Button onClick={() => setVisibleCount(prev => Math.min(prev + 15, filteredProducts.length))}>
                          Mehr laden
                        </Button>
                      </InlineStack>
                    </Box>
                  )}

                  {mode === "infinite" && !hasMoreInfinite && (
                    <Box padding="200">
                      <Text alignment="center" tone="subdued">Keine weiteren Produkte</Text>
                    </Box>
                  )}

                  {mode === "paginated" && (
                    <Box paddingBlock="400">
                      <InlineStack align="center">
                        <Pagination
                          hasPrevious={currentPage > 0}
                          onPrevious={() => setCurrentPage(p => p - 1)}
                          hasNext={currentPage < totalPages - 1}
                          onNext={() => setCurrentPage(p => p + 1)}
                        />
                      </InlineStack>
                    </Box>
                  )}

                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}
