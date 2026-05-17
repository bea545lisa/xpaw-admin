import { BlockStack, Box, Text, Button, InlineStack, Pagination, Checkbox } from "@shopify/polaris";
import { ErrorBoundary } from "./ErrorBoundary";
import ProductSkeleton from "./ProductSkeleton";
import ProductList from "./ProductList";
import BulkActionsBar from "./BulkActionsBar";

export default function ProductListSection({
  isLoading,
  visibleProducts, filteredProducts,
  selectedIds, toggleSelect, clearSelection, selectAll,
  pendingDeleteIds, restoredIds,
  localProducts, setLocalProducts,
  fetcher, setToast, allTags, allCollections,
  handleBulkDelete,
  host, shop,
  mode, visibleCount, setVisibleCount,
  currentPage, setCurrentPage, totalPages,
}) {
  const hasMoreInfinite = visibleCount < filteredProducts.length;

  const toggleAll = () => {
    if (selectedIds.length === visibleProducts.length) clearSelection();
    else selectAll(visibleProducts.map(p => p?.node?.id).filter(Boolean));
  };

  return (
    <BlockStack gap="100">
      <Box paddingInline="200">
        <Checkbox
          label="Alle auswählen"
          checked={selectedIds.length > 0 && selectedIds.length === visibleProducts.length}
          onChange={toggleAll}
        />
        <BulkActionsBar
          selectedIds={selectedIds}
          localProducts={localProducts}
          fetcher={fetcher}
          setLocalProducts={setLocalProducts}
          setToast={setToast}
          clearSelection={clearSelection}
          allTags={allTags}
          allCollections={allCollections}
          handleBulkDelete={handleBulkDelete}
        />
      </Box>

      {/* Grid-Header */}
      <style>{`
        .product-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 92px 72px 100px 48px;
          gap: 10px;
          align-items: start;
          width: 100%;
          position: relative;
        }
      `}</style>
      <div style={{ borderBottom: "2px solid var(--p-color-border)", padding: "8px 0" }}>
        <div
          className="product-grid"
          style={{
            transition: "all 0.2s ease",
            borderRadius: 12,
            gap: 0,
          }}>
          <div style={{ paddingLeft: 10, paddingTop: 8 }}><Text variant="headingSm" tone="subdued">Produkt</Text></div>
          <div style={{ textAlign: "right", paddingRight: 8, paddingTop: 8 }}><Text variant="headingSm" tone="subdued">Preis</Text></div>
          <div style={{ textAlign: "right" , paddingRight: 8, paddingTop: 8 }}><Text variant="headingSm" tone="subdued">Inventar</Text></div>
          <div style={{ textAlign: "center", paddingTop: 8, paddingRight: 8 }}><Text variant="headingSm" tone="subdued">Status</Text></div>
          <div style={{ textAlign: "center", paddingTop: 8 }}><Text variant="headingSm" tone="subdued"></Text></div>
        </div>
      </div>

      {/* Liste oder Skeleton */}
      {isLoading ? (
        <ProductSkeleton rows={8} />
      ) : (
        <ErrorBoundary>
          <ProductList
            products={visibleProducts}
            host={host}
            shop={shop}
            setProductList={setLocalProducts}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            pendingDeleteIds={pendingDeleteIds}
            restoredIds={restoredIds}
          />
        </ErrorBoundary>
      )}

      {/* Pagination */}
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
              hasPrevious={currentPage > 0} onPrevious={() => setCurrentPage(p => p - 1)}
              hasNext={currentPage < totalPages - 1} onNext={() => setCurrentPage(p => p + 1)}
            />
          </InlineStack>
        </Box>
      )}
    </BlockStack>
  );
}
