import {Card, BlockStack, Toast, Icon, Text, Modal} from "@shopify/polaris";
import { ProductIcon } from "@shopify/polaris-icons";
import { useLoaderData, useLocation, useNavigation } from "react-router";
import { useEffect, useState, useMemo } from "react";

import ProductModal from "../components/ProductModal";
import MetafieldsModal from "../components/MetafieldsModal";
import ProductToolbar from "../components/ProductToolbar";
import ProductListSection from "../components/ProductListSection";
import { ErrorBoundary } from "../components/ErrorBoundary";
import ProductSkeleton from "../components/ProductSkeleton.jsx";

import DeleteModal from "../components/shared/DeleteModal.jsx";

import { useProduct } from "../hooks/useProduct.jsx";
import { useProductCRUD } from "../hooks/useProductCRUD.js";
import { useBulkDelete } from "../hooks/useBulkDelete.js";
import { useMetafields } from "../hooks/useMetafields.js";
import { useExport } from "../hooks/useExport.js";
import { useProductContext } from "../hooks/useProductContext.js";
import { useProductFilters } from "../hooks/useProductFilters.js";

import { authenticate } from "../shopify.server";
import { productsLoader } from "../loaders/products.loader.server";
import { productsAction } from "../actions/products.action.server.js";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return productsLoader({ request }, admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return productsAction({ request }, admin);
};

import { ProductContext } from "../context/ProductContext";

const PAGE_SIZE = 50;

// ─── Skeleton ────────────────────────────────────────────────────────────────────

export function HydrateFallback() {
  return (
    <div style={{ padding: "16px 0" }}>
      <ProductSkeleton rows={8} />
    </div>
  );
}

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

  const {
    query, setQuery,
    statusFilter, setStatusFilter,
    collectionFilter, setCollectionFilter,
    tagFilter, setTagFilter,
    variantFilter, setVariantFilter,
    saleFilter, setSaleFilter,
    noImagesFilter, setNoImagesFilter,
    stockBucketFilter, setStockBucketFilter,
    priceBucketFilter, setPriceBucketFilter,
    sortBy, setSortBy,
    sortDirection, setSortDirection,
    filteredProducts,
    allTags,
    allCollections,
  } = useProductFilters({ localProducts });

  const [openMenuId, setOpenMenuId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(15);
  const [currentPage, setCurrentPage] = useState(0);

  const { selectedIds, toggleSelect, clearSelection, selectAll } = useProduct();
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading" && navigation.location?.pathname === "/app/products";

  const [mode] = useState(initialProducts.length < 100 ? "infinite" : "paginated");

  useEffect(() => {
    if (initialProducts?.length > 0 && localProducts.length === 0) {
      setLocalProducts(initialProducts);
    }
  }, [initialProducts]);

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
        <div style={{ padding: "20px 32px", width: "100%", background: "#f6f6f7", minHeight: "100vh" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 20, height: 20, flexShrink: 0 }}>
              <Icon source={ProductIcon} />
            </div>
            <Text variant="headingLg" as="h1">Produkte ({filteredProducts.length})</Text>
          </div>

              <BlockStack gap="400">
              {/* ProductModal deaktiviert — wird in Detailseite editiert
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
              */}

              {/* MetafieldsModal deaktiviert — wird in Detailseite editiert
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
              */}

              <Card paddingInline="200" paddingBlock="100">
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
              </Card>

              <Card paddingInline="200" paddingBlock="100">

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
                  allCollections={allCollections}
                  handleBulkDelete={handleBulkDelete}
                  host={host}
                  shop={shop}
                  mode={mode}
                  visibleCount={visibleCount}
                  setVisibleCount={setVisibleCount}
                  currentPage={currentPage}
                  setCurrentPage={setCurrentPage}
                  totalPages={totalPages}
                />
              </Card>

            </BlockStack>
        </div>

        <DeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title={deleteTitle}
          onDelete={handleDeleteConfirm}
          isDeleting={isDeleting}
        />

        {toast && (
          <div style={{
            position: "fixed", bottom: 20,
            left: "calc(250px + (100vw - 250px) / 2)",
            transform: "translateX(-50%)",
            background: "#303030", color: "white",
            padding: "12px 16px", borderRadius: 8,
            zIndex: 9999,
            whiteSpace: "nowrap",
          }}>
            {toast}
          </div>
        )}

      </ProductContext.Provider>
    </>
  );
}
