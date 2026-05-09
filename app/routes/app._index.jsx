import { Page, Layout, Card, BlockStack, Toast } from '@shopify/polaris';
import { useLoaderData, useNavigation } from 'react-router';
import { useEffect, useState, useMemo } from 'react';

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

  // Edit States
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editVariants, setEditVariants] = useState([]);
  const [editImages, setEditImages] = useState([]);
  const [editOptions, setEditOptions] = useState([]);
  const [editTags, setEditTags] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  // Delete States
  const [deleteId, setDeleteId] = useState(null);
  const [deleteTitle, setDeleteTitle] = useState("");

  // Filter States
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [collectionFilter, setCollectionFilter] = useState(null);
  const [tagFilter, setTagFilter] = useState(null);
  const [saleFilter, setSaleFilter] = useState(false);
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Menu + Pagination
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
    handleUpdate, handleDelete,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProducts]);

  const filteredProducts = localProducts
    .filter(p => statusFilter === "ALL" || p?.node?.status === statusFilter)
    .filter(p => p?.node?.title?.toLowerCase().includes(query.toLowerCase()))
    .filter(p => {
      if (!collectionFilter) return true;
      if (collectionFilter === "NONE") return (p?.node?.collections?.edges?.length ?? 0) === 0;
      return p?.node?.collections?.edges?.some(e => e.node.id === collectionFilter);
    })
    .filter(p => {
      if (!tagFilter) return true;
      if (tagFilter === "NONE") return (p?.node?.tags?.length ?? 0) === 0;
      return p?.node?.tags?.includes(tagFilter);
    })
    .filter(p => {
      if (!saleFilter) return true;
      return p?.node?.variants?.edges?.some(e =>
        e.node.compareAtPrice && parseFloat(e.node.compareAtPrice) > parseFloat(e.node.price)
      );
    })
    .filter(p => {
      if (!lowStockFilter) return true;
      return p?.node?.variants?.edges?.some(e => (e.node.inventoryQuantity ?? 0) === 0);
    })
  ;

  const allTags = useMemo(() => {
    const set = new Set();
    localProducts.forEach(p => p.node.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [localProducts]);

  const allCollections = useMemo(() => {
    const map = new Map();
    localProducts.forEach(p => {
      p.node.collections?.edges?.forEach(({ node: c }) => {
        if (!map.has(c.id)) map.set(c.id, c);
      });
    });
    return Array.from(map.values());
  }, [localProducts]);

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

      {/* Delete Progress Banner */}
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
        <Page title={`Produkte (${filteredProducts.length})`}>
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
                      handleDelete={handleDelete}
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
                    lowStockFilter={lowStockFilter} setLowStockFilter={setLowStockFilter}
                    isCreating={isCreating}
                    onCreate={() => fetcher.submit({ action: "create" }, { method: "post" })}
                    collections={allCollections}
                    collectionFilter={collectionFilter}
                    setCollectionFilter={setCollectionFilter}
                    allTags={allTags}
                    tagFilter={tagFilter}
                    setTagFilter={setTagFilter}
                    shop={shop}
                    onExport={handleExport}
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