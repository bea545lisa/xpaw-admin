import { abbreviate } from "./skuAbbreviation.js";

/**
 * @param {object[]} options
 * @param {object}   abbreviationsMap  – flache Map { "Blau": "bl", "M": "m", ... } aus dem Metafeld
 */
export function normalizeOptions(options = [], abbreviationsMap = {}) {
  return options
    .filter((option) => option?.name !== "Title")
    .map((option) => {
      const vals = option.optionValues?.map((v) => v.name).filter(Boolean) ?? option.values ?? [];
      // Kürzel: vorhandene option.abbreviations behalten (z. B. nach setState),
      // dann Metafeld-Map, dann globales Mapping als Fallback
      const abbreviations = option.abbreviations
        ?? Object.fromEntries(vals.map((v) => [v, abbreviationsMap[v] ?? abbreviate(v)]));
      return { ...option, values: vals, abbreviations };
    })
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
