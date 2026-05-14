import { BlockStack } from "@shopify/polaris";
import { AnimatePresence, motion, Reorder } from "framer-motion";
import ProductItem from "./product/list/ProductItem.jsx";
import { useProductContext } from "../context/ProductContext";

export default function ProductList({
  products,
  host,
  selectedIds,
  toggleSelect,
  setProductList,
  pendingDeleteIds,
  restoredIds,
}) {
  const visibleProducts = products.filter(p => !pendingDeleteIds.includes(p.node.id));
  const { openMenuId } = useProductContext();

  return (
    <BlockStack gap="200">
      <AnimatePresence>
        <Reorder.Group as="div" axis="y" values={visibleProducts} onReorder={setProductList}>
          {visibleProducts.map((p, index) => (
          <motion.div
            key={p.node.id}
            layout
            style={{
              position: "relative",
              zIndex: openMenuId === p.node.id ? 1000 : 1,  // ← NEU
            }}
          >
            <div style={{
              transition: "filter 0.2s, opacity 0.2s",
              filter: openMenuId && openMenuId !== p.node.id ? "blur(1px)" : "none",
              opacity: openMenuId && openMenuId !== p.node.id ? 0.4 : 1,
            }}>
              <Reorder.Item as="div" key={p.node.id} value={p}>
                          <ProductItem
                            index={index}
                            product={p}
                            host={host}
                            selected={selectedIds.includes(p.node.id)}
                            onSelect={() => toggleSelect(p.node.id)}
                            isPendingDelete={pendingDeleteIds.includes(p.node.id)}
                            isRestored={restoredIds.includes(p.node.id)}
                          />
              </Reorder.Item>
            </div>
          </motion.div>
          ))}
        </Reorder.Group>
      </AnimatePresence>
    </BlockStack>
  );
}
