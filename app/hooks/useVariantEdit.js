import { useState } from "react";

export function useVariantEdit({ fetcher, productId, locationId, setLocalVariants }) {
  const [variantDraft, setVariantDraft] = useState({});
  const [editingVariantId, setEditingVariantId] = useState(null);

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
      productId,
      variantId: v.id,
      price: safePrice,
      compareAtPrice: safeCompareAtPrice,
      sku: safeSku,
      barcode: safeBarcode,
      quantity: safeQuantity,
      inventoryItemId: v.inventoryItem?.id ?? "",
      locationId: locationId ?? "",
    }, { method: "POST" });

    setLocalVariants((prev) => prev.map((lv) => lv.id === v.id ? {
      ...lv,
      price: safePrice,
      compareAtPrice: safeCompareAtPrice || null,
      sku: safeSku,
      barcode: safeBarcode,
      inventoryQuantity: isNaN(qty) ? lv.inventoryQuantity : qty,
    } : lv));

    setEditingVariantId(null);
  };

  const isSaving = fetcher.state !== "idle" && fetcher.formData?.get("action") === "updateVariantAll";

  return {
    variantDraft, setVariantDraft,
    editingVariantId, setEditingVariantId,
    openVariantEdit, handleVariantSave,
    isSaving,
  };
}
