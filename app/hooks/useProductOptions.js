import { useState, useMemo, useEffect } from "react";
import { normalizeOptions, buildOptionsFromVariants } from "../utils/productOptions.js";

export function useProductOptions({ product, fetcher, setLocalVariants, setToast, abbreviationsMap = {}, shopAbbreviations = {} }) {
  // Kombinierte Map: Produkt-spezifisch hat Vorrang vor Shop-weit
  const combinedAbbreviations = useMemo(() => ({ ...shopAbbreviations, ...abbreviationsMap }), []);

  const initialOptions = useMemo(() => {
    const opts = buildOptionsFromVariants(
      product.variants?.edges?.map((e) => e.node) ?? [],
      product.options ?? []
    );
    return normalizeOptions(opts, combinedAbbreviations);
  }, []);

  const [optionDrafts, setOptionDrafts] = useState(initialOptions);

  const initialOptionsJson = useMemo(
    () => JSON.stringify(initialOptions),
    [initialOptions]
  );
  const optionsDirty = JSON.stringify(optionDrafts) !== initialOptionsJson;

  // Nach Speichern: localVariants + optionDrafts aktualisieren
  useEffect(() => {
    if (fetcher.data?.type === "updateOptions" && fetcher.data?.product) {
      const next = fetcher.data.product;
      const nextVariants = next.variants?.edges?.map((e) => e.node) ?? [];
      setLocalVariants(nextVariants);
      setOptionDrafts(normalizeOptions(next.options ?? [], combinedAbbreviations));
    }
  }, [fetcher.data]);

  const handleOptionsSave = () => {
    const normalized = optionDrafts
      .map((option) => ({
        id: option.id,
        name: String(option.name ?? "").trim(),
        values: Array.isArray(option.values)
          ? option.values.map((v) => String(v).trim()).filter(Boolean)
          : [],
      }))
      .filter((option) => option.name && option.values.length > 0);

    if (normalized.length === 0) {
      setToast?.("Mindestens eine Option mit Werten ist erforderlich");
      return;
    }

    // Kürzel aller Optionen zu einer flachen Map zusammenführen
    const abbreviations = Object.assign(
      {}, ...optionDrafts.map((o) => o.abbreviations ?? {})
    );

    fetcher.submit(
      {
        action: "updateOptions",
        id: product.id,
        options: JSON.stringify(normalized),
        abbreviations: JSON.stringify(abbreviations),
      },
      { method: "POST" }
    );
  };

  return {
    optionDrafts,
    setOptionDrafts,
    optionsDirty,
    handleOptionsSave,
  };
}
