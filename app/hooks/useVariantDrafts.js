import { useEffect, useMemo, useRef, useState } from "react";

export function computeVariantCombinations(options, existingVariants) {
  if (!options || options.length === 0) return [];
  const optionValues = options.map((o) => (o.values ?? []).filter((v) => String(v).trim() !== ""));
  if (optionValues.some((values) => values.length === 0)) return [];

  const combinations = optionValues.reduce((acc, values) => {
    if (acc.length === 0) return values.map((value) => [value]);
    return acc.flatMap((combo) => values.map((value) => [...combo, value]));
  }, []);

  return combinations.map((combo) => {
    const title = combo.join(" / ");
    const existing = existingVariants?.find((variant) => variant.title === title);
    if (existing) return { ...existing };
    return {
      id: null,
      title,
      price: "0.00",
      compareAtPrice: "",
      inventoryQuantity: 0,
      imageId: null,
      active: true,
    };
  });
}

export function useVariantDrafts({ variants = [], initialOptions = [], fetcher, productId }) {
  const isFirstRender = useRef(true);
  const [optionDrafts, setOptionDrafts] = useState(initialOptions);
  const [variantDrafts, setVariantDrafts] = useState(variants);

  useEffect(() => {
    setVariantDrafts(variants);
  }, [variants]);

  const hasRealOptions = optionDrafts.length > 0;
  const defaultVariant = useMemo(() => (
    variantDrafts.length === 1 && variantDrafts[0]?.title === "Default Title"
      ? variantDrafts[0]
      : null
  ), [variantDrafts]);

  useEffect(() => {
    if (!hasRealOptions) return;
    setVariantDrafts(computeVariantCombinations(optionDrafts, variants));
  }, [hasRealOptions, optionDrafts, variants]);

  const updateVariant = (variantIndex, changes) => {
    setVariantDrafts((current) => {
      const updated = [...current];
      updated[variantIndex] = { ...updated[variantIndex], ...changes };
      return updated;
    });
  };

  const handleOptionsSave = () => {
    const normalized = optionDrafts
      .map((option) => ({
        id: option.id,
        name: String(option.name ?? "").trim(),
        values: Array.isArray(option.values)
          ? option.values.map((value) => String(value).trim()).filter(Boolean)
          : [],
      }))
      .filter((option) => option.name && option.values.length > 0);

    fetcher.submit(
      { action: "updateOptions", id: productId, options: JSON.stringify(normalized) },
      { method: "POST" }
    );
  };

  return {
    optionDrafts,
    setOptionDrafts,
    variantDrafts,
    setVariantDrafts,
    updateVariant,
    hasRealOptions,
    defaultVariant,
    handleOptionsSave,
  };
}
