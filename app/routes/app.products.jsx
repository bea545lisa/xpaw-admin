import { Page, Layout, Card, BlockStack, Toast } from "@shopify/polaris";
import { useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState, useMemo } from "react";

import ProductModal from "../components/ProductModal";
import MetafieldsModal from "../components/MetafieldsModal";
import ProductToolbar from "../components/ProductToolbar";
import ProductListSection from "../components/ProductListSection";
import { ErrorBoundary } from "../components/ErrorBoundary";

import { useProduct } from "../hooks/useProduct.jsx";
import { useProductCRUD } from "../hooks/useProductCRUD.js";
import { useBulkDelete } from "../hooks/useBulkDelete.js";
import { useMetafields } from "../hooks/useMetafields.js";
import { useExport } from "../hooks/useExport.js";
import { useProductContext } from "../hooks/useProductContext.js";

export { loader } from "../loaders/products.loader.server";
export { action } from "../actions/products.action.server.jsx";

import { ProductContext } from "../context/ProductContext";

const PAGE_SIZE = 50;

export default function Products() {
  const { products: initialProducts, host, locationId, shop } = useLoaderData();
  const location = useLocation();

  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVariants, setEditVariants] = useState([]);
  const [editImages, setEditImages] = useState([]);
  const [editOptions, setEditOptions] = useState([]);
  const [editTags, setEditTags] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleteTitle, setDeleteTitle] = useState("");

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState({ operator: "is", values: [] });
  const [collectionFilter, setCollectionFilter] = useState({ operator: "is", values: [] });
  const [tagFilter, setTagFilter] = useState({ operator: "is", values: [] });
  const [variantFilter, setVariantFilter] = useState({ operator: "is", values: [] });
  const [saleFilter, setSaleFilter] = useState(false);
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [stockBucketFilter, setStockBucketFilter] = useState("");
  const [noImagesFilter, setNoImagesFilter] = useState(false);
  const [priceBucketFilter, setPriceBucketFilter] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDirection, setSortDirection] = useState("descending");

  const [openMenuId, setOpenMenuId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [currentPage, setCurrentPage] = useState(0);

  const { selectedIds, toggleSelect, clearSelection, selectAll } = useProduct();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  const {
    fetcher, localProducts, setLocalProducts,
    toast, setToast,
    deleteModalOpen, setDeleteModalOpen,
    isUpdating, isDeleting, isCreating,
    handleUpdate, handleDeleteConfirm,
  } = useProductCRUD({
    locationId, editId, editValue, editDescription,
    editVariants, editOptions, deleteId, deleteTitle,
    onUpdateSuccess: () => setModalOpen(false),
  });

  const [mode] = useState(initialProducts.length < 100 ? "infinite" : "paginated");

  useEffect(() => {
    if (initialProducts?.length > 0 && localProducts.length === 0) {
      setLocalProducts(initialProducts);
    }
  }, [initialProducts]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    const stock = params.get("stock");
    const status = params.get("status");
    const sale = params.get("sale");
    const noImages = params.get("noImages");
    const collectionTitle = params.get("collectionTitle");
    const priceBucket = params.get("priceBucket");

    if (view === "low-stock") {
      setStockBucketFilter("low-stock");
    }
    if (stock) {
      setStockBucketFilter(stock);
    }
    if (status) {
      setStatusFilter({ operator: "is", values: [status] });
    }
    if (sale === "1") {
      setSaleFilter(true);
    }
    if (noImages === "1") {
      setNoImagesFilter(true);
    }
    if (collectionTitle) {
      const match = allCollections.find((collection) => collection.title === collectionTitle);
      if (match) {
        setCollectionFilter({ operator: "is", values: [match.id] });
      }
    }
    if (priceBucket) {
      setPriceBucketFilter(priceBucket);
    }
  }, [location.search]);

  const filteredProducts = localProducts
    .filter((p) => {
      if (!statusFilter.values.length) return true;
      const productStatus = p?.node?.status;
      const matches = statusFilter.values.map((value) => productStatus === value);
      return statusFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
    })
    .filter((p) => p?.node?.title?.toLowerCase().includes(query.toLowerCase()))
    .filter((p) => {
      if (!collectionFilter.values.length) return true;
      const collectionIds = p?.node?.collections?.edges?.map((e) => e.node.id) ?? [];
      const matches = collectionFilter.values.map((value) => (
        value === "NONE" ? collectionIds.length === 0 : collectionIds.includes(value)
      ));
      return collectionFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
    })
    .filter((p) => {
      if (!tagFilter.values.length) return true;
      const tags = p?.node?.tags ?? [];
      const matches = tagFilter.values.map((value) => (
        value === "NONE" ? tags.length === 0 : tags.includes(value)
      ));
      return tagFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
    })
    .filter((p) => {
      if (!variantFilter.values.length) return true;
      const optionCount = (p?.node?.options ?? []).filter((o) => o?.name !== "Title").length;
      const variantBucket =
        optionCount === 0 ? "NO_OPTIONS" :
        optionCount === 1 ? "ONE_OPTION" :
        "TWO_OPTIONS";
      const matches = variantFilter.values.map((value) => variantBucket === value);
      return variantFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
    })
    .filter((p) => {
      if (!saleFilter) return true;
      return p?.node?.variants?.edges?.some((e) => e.node.compareAtPrice && parseFloat(e.node.compareAtPrice) > parseFloat(e.node.price));
    })
    .filter((p) => {
      if (!noImagesFilter) return true;
      return !p?.node?.featuredImage?.url;
    })
    .filter((p) => {
      if (!priceBucketFilter) return true;
      const lowestPrice = Math.min(...(p?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
      if (priceBucketFilter === "under-25") return lowestPrice < 25;
      if (priceBucketFilter === "25-49") return lowestPrice >= 25 && lowestPrice < 50;
      if (priceBucketFilter === "50-99") return lowestPrice >= 50 && lowestPrice < 100;
      if (priceBucketFilter === "100-199") return lowestPrice >= 100 && lowestPrice < 200;
      if (priceBucketFilter === "200-plus") return lowestPrice >= 200;
      return true;
    })
    .filter((p) => {
      if (!stockBucketFilter) return true;
      const quantities = p?.node?.variants?.edges?.map((e) => Number(e.node.inventoryQuantity) || 0) ?? [];
      const anyOutOfStock = quantities.some((quantity) => quantity === 0);
      const anyLowStock = quantities.some((quantity) => quantity > 0 && quantity <= 5);
      const hasInventory = quantities.some((quantity) => quantity > 0);

      if (stockBucketFilter === "out-of-stock") return anyOutOfStock;
      if (stockBucketFilter === "low-stock") return anyLowStock;
      if (stockBucketFilter === "healthy") return hasInventory && !anyOutOfStock && !anyLowStock;
      return true;
    })
    .sort((a, b) => {
      const getTime = (value) => {
        const time = new Date(value ?? 0).getTime();
        return Number.isFinite(time) ? time : 0;
      };
      const directionFactor = sortDirection === "ascending" ? 1 : -1;
      if (sortBy === "title") {
        return String(a?.node?.title ?? "").localeCompare(String(b?.node?.title ?? ""), "de") * directionFactor;
      }
      if (sortBy === "createdAt") {
        return (getTime(a?.node?.createdAt) - getTime(b?.node?.createdAt)) * directionFactor;
      }
      if (sortBy === "price") {
        const priceA = Math.min(...(a?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
        const priceB = Math.min(...(b?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
        return (priceA - priceB) * directionFactor;
      }
      return (getTime(a?.node?.updatedAt) - getTime(b?.node?.updatedAt)) * directionFactor;
    });

  const allTags = useMemo(() => {
    const set = new Set();
    localProducts.forEach((p) => p.node.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [localProducts]);

  const allCollections = useMemo(() => {
    const map = new Map();
    localProducts.forEach((p) => {
      p.node.collections?.edges?.forEach(({ node: c }) => {
        if (!map.has(c.id)) map.set(c.id, c);
      });
    });
    return Array.from(map.values());
  }, [localProducts]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const collectionTitle = params.get("collectionTitle");
    if (!collectionTitle || allCollections.length === 0) return;

    const match = allCollections.find((collection) => collection.title === collectionTitle);
    if (match) {
      setCollectionFilter({ operator: "is", values: [match.id] });
    }
  }, [location.search, allCollections]);

  const visibleProducts = mode === "infinite"
    ? filteredProducts.slice(0, visibleCount)
    : filteredProducts.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);

  const { pendingDeleteIds, progress, restoredIds, handleBulkDelete, handleUndo } = useBulkDelete({
    localProducts, setLocalProducts, selectedIds, clearSelection, fetcher, setToast,
  });

  const metafields = useMetafields();
  const { handleExport } = useExport({ filteredProducts, setToast });

  const productContext = useProductContext({
    fetcher, setLocalProducts, setToast, metafields,
    setEditDescription, setEditTags, setEditId, setEditValue,
    setEditVariants, setEditOptions, setEditImages,
    setModalOpen, setDeleteId, setDeleteTitle, setDeleteModalOpen,
    openMenuId, setOpenMenuId,
  });

  return (
    <>
      {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}

      {pendingDeleteIds.length > 0 && (
        <div style={{ position: "fixed", bottom: 20, right: 20, background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, width: 260, zIndex: 9999 }}>
          <div style={{ marginBottom: 8 }}>{pendingDeleteIds.length} wird gelöscht…</div>
          <div style={{ height: 4, background: "#555", borderRadius: 2, overflow: "hidden", marginBottom: 8 }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "#4ea1ff", transition: "width 1s linear" }} />
          </div>
          <button onClick={handleUndo} style={{ background: "transparent", color: "#4ea1ff", border: "none", cursor: "pointer" }}>Rückgängig</button>
        </div>
      )}

      <ProductContext.Provider value={productContext}>
        <Page fullWidth title={`Produkte (${filteredProducts.length})`}>
          <Layout>
            <Layout.Section>
              <Card paddingInline="300" paddingBlock="100">
                <BlockStack gap="400">
                  <ErrorBoundary>
                    <ProductModal
                      key="product-modal"
                      modalOpen={modalOpen} setModalOpen={setModalOpen}
                      editValue={editValue} setEditValue={setEditValue}
                      editDescription={editDescription} setEditDescription={setEditDescription}
                      variants={editVariants} setEditVariants={setEditVariants}
                      editOptions={editOptions} setEditOptions={setEditOptions}
                      editImages={editImages}
                      initialTags={editTags}
                      allTags={allTags}
                      productId={editId}
                      handleUpdate={handleUpdate}
                      isUpdating={isUpdating}
                      deleteModalOpen={deleteModalOpen}
                      setDeleteModalOpen={setDeleteModalOpen}
                      deleteTitle={deleteTitle}
                      handleDelete={handleDeleteConfirm}
                      isDeleting={isDeleting}
                      setLocalProducts={setLocalProducts}
                      setToast={setToast}
                    />
                  </ErrorBoundary>

                  <MetafieldsModal
                    open={metafields.metafieldsModalOpen}
                    onClose={() => metafields.setMetafieldsModalOpen(false)}
                    metafields={metafields.metafields}
                    newMetafield={metafields.newMetafield}
                    setNewMetafield={metafields.setNewMetafield}
                    productId={metafields.activeProductId}
                    onSave={metafields.saveMetafield}
                    onDelete={metafields.deleteMetafield}
                  />

                  <ProductToolbar
                    query={query} setQuery={setQuery}
                    statusFilter={statusFilter} setStatusFilter={setStatusFilter}
                    saleFilter={saleFilter} setSaleFilter={setSaleFilter}
                    lowStockFilter={stockBucketFilter === "low-stock"}
                    setLowStockFilter={(value) => setStockBucketFilter(value ? "low-stock" : "")}
                    noImagesFilter={noImagesFilter} setNoImagesFilter={setNoImagesFilter}
                    priceBucketFilter={priceBucketFilter} setPriceBucketFilter={setPriceBucketFilter}
                    sortBy={sortBy} setSortBy={setSortBy}
                    sortDirection={sortDirection} setSortDirection={setSortDirection}
                    isCreating={isCreating}
                    onCreate={() => fetcher.submit({ action: "create" }, { method: "post" })}
                    collections={allCollections}
                    collectionFilter={collectionFilter}
                    setCollectionFilter={setCollectionFilter}
                    allTags={allTags}
                    tagFilter={tagFilter}
                    setTagFilter={setTagFilter}
                    variantFilter={variantFilter}
                    setVariantFilter={setVariantFilter}
                    shop={shop}
                    onExport={handleExport}
                    onImport={() => setToast("Import folgt in einem nächsten Schritt")}
                    onMoreActions={() => setToast("Weitere Aktionen folgen in einem nächsten Schritt")}
                  />

                  <ProductListSection
                    isLoading={isLoading}
                    visibleProducts={visibleProducts}
                    filteredProducts={filteredProducts}
                    selectedIds={selectedIds}
                    toggleSelect={toggleSelect}
                    clearSelection={clearSelection}
                    selectAll={selectAll}
                    pendingDeleteIds={pendingDeleteIds}
                    restoredIds={restoredIds}
                    localProducts={localProducts}
                    setLocalProducts={setLocalProducts}
                    fetcher={fetcher}
                    setToast={setToast}
                    allTags={allTags}
                    handleBulkDelete={handleBulkDelete}
                    host={host}
                    mode={mode}
                    visibleCount={visibleCount}
                    setVisibleCount={setVisibleCount}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    totalPages={totalPages}
                  />
                </BlockStack>
              </Card>
            </Layout.Section>
          </Layout>
        </Page>
      </ProductContext.Provider>
    </>
  );
}
