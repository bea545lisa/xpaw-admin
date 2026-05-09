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
  fetcher, setToast, allTags,
  handleBulkDelete,
  host,
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
          handleBulkDelete={handleBulkDelete}
        />
      </Box>

      {/* Grid-Header */}
      <style>{`
        .product-grid {
          display: grid;
          grid-template-columns: 1fr 80px 60px 50px 90px;
          gap: 8px;
          align-items: center;
          width: 100%;
          position: relative;
        }
      `}</style>
      <Box paddingInline="200" paddingBlock="200">
        <div className="product-grid">
          <div style={{ paddingLeft: 82 }}><Text variant="headingSm" tone="subdued">Produkt</Text></div>
          <div style={{ textAlign: "right" }}><Text variant="headingSm" tone="subdued">Preis</Text></div>
          <div style={{ textAlign: "right" }}><Text variant="headingSm" tone="subdued">Lager</Text></div>
          <div style={{ textAlign: "center" }}><Text variant="headingSm" tone="subdued">Aktionen</Text></div>
          <div style={{ textAlign: "center" }}><Text variant="headingSm" tone="subdued">Status</Text></div>
        </div>
      </Box>

      {/* Liste oder Skeleton */}
      {isLoading ? (
        <ProductSkeleton rows={8} />
      ) : (
        <ErrorBoundary>
          <ProductList
            products={visibleProducts}
            host={host}
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