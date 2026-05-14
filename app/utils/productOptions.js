export function normalizeOptions(options = []) {
  return options
    .filter((option) => option?.name !== "Title")
    .map((option) => ({
      ...option,
      values: option.optionValues?.map((value) => value.name).filter(Boolean) ?? option.values ?? [],
    }))
    .filter((option) => option.name && option.values.length > 0);
}

export function buildOptionsFromVariants(variants, fallbackOptions = []) {
  // product.options hat IMMER alle Werte → priorisieren
  const normalized = normalizeOptions(fallbackOptions);
  if (normalized.length > 0) return normalized;

  // Fallback: aus selectedOptions sammeln
  const groups = new Map();
  variants.forEach((variant) => {
    (variant.selectedOptions ?? []).forEach((selectedOption) => {
      if (!selectedOption?.name || selectedOption.name === "Title" || !selectedOption.value) return;
      if (!groups.has(selectedOption.name)) groups.set(selectedOption.name, new Set());
      groups.get(selectedOption.name).add(selectedOption.value);
    });
  });
  return Array.from(groups.entries()).map(([name, values]) => ({
    name, values: Array.from(values),
  }));
}
