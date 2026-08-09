import { useState, useEffect, useMemo } from "react";
import { useLocation } from "react-router";

export function useProductFilters({ localProducts }) {
  const location = useLocation();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState({ operator: "is", values: [] });
  const [collectionFilter, setCollectionFilter] = useState({ operator: "is", values: [] });
  const [tagFilter, setTagFilter] = useState({ operator: "is", values: [] });
  const [variantFilter, setVariantFilter] = useState({ operator: "is", values: [] });
  const [saleFilter, setSaleFilter] = useState(false);
  const [noImagesFilter, setNoImagesFilter] = useState(false);
  const [noTranslationFilter, setNoTranslationFilter] = useState(false);
  const [metafieldFilter, setMetafieldFilter] = useState({ operator: "is", values: [] });
  const [optionValueFilter, setOptionValueFilter] = useState({ operator: "is", values: [] });
  const [stockBucketFilter, setStockBucketFilter] = useState("");
  const [priceBucketFilter, setPriceBucketFilter] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortDirection, setSortDirection] = useState("descending");

  const allTags = useMemo(() => {
    const set = new Set();
    localProducts.forEach((p) => p.node.tags?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [localProducts]);

  // Metafields eines Produkts als durchsuchbare Texte — Feldname (Key) UND Wert, damit man sowohl
  // nach dem Namen ("test", "nachhaltigkeit") als auch nach Werten (auch "Bezeichnung" bei
  // Eigenschaften-Metaobjects, da im displayValue enthalten) suchen kann. Interne App-eigene
  // Metafields (Sortierreihenfolge, Swatch-Konfiguration) sind ausgeschlossen.
  const HIDDEN_METAFIELD_KEYS = ["title_tag", "description_tag", "metafields_order", "option_swatches"];
  const productMetafieldValues = (p) =>
    (p?.node?.metafields?.edges ?? [])
      .filter((e) => !HIDDEN_METAFIELD_KEYS.includes(e.node.key))
      .flatMap((e) => [e.node.key, e.node.displayValue ?? e.node.value])
      .filter(Boolean);

  // Für den Filter-Tab: pro Produkt die Menge an auswählbaren "Eigenschaften"-Optionen — bei
  // Metaobject-Referenzen (z.B. "Eigenschaften") eine Option pro Bezeichnung (z.B. "Material"),
  // nicht pro Wert-Kombination; bei normalen Metafields eine Option pro Feldname (z.B. "test").
  const productMetafieldFilterKeys = (p) =>
    (p?.node?.metafields?.edges ?? [])
      .filter((e) => !HIDDEN_METAFIELD_KEYS.includes(e.node.key))
      .flatMap((e) =>
        e.node.bezeichnungen?.length
          ? e.node.bezeichnungen.map((b) => `bez::${b}`)
          : [`key::${e.node.key}`]
      );

  const allMetafieldOptions = useMemo(() => {
    const map = new Map();
    localProducts.forEach((p) => {
      productMetafieldFilterKeys(p).forEach((value) => {
        if (map.has(value)) return;
        map.set(value, { value, label: value.slice(5) });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [localProducts]);

  // Options-Werte eines Produkts (z.B. "Farbe: Rot") als `${Name}::${Wert}`-Liste — für Suche
  // und den Varianten-Werte-Filter.
  const productOptionValues = (p) =>
    (p?.node?.options ?? [])
      .filter((o) => o?.name && o.name !== "Title")
      .flatMap((o) =>
        (o.optionValues?.map((v) => v?.name).filter(Boolean) ?? o.values ?? [])
          .filter((v) => v && v !== "Default Title")
          .map((v) => `${o.name}::${v}`)
      );

  const allOptionValues = useMemo(() => {
    const map = new Map();
    localProducts.forEach((p) => {
      productOptionValues(p).forEach((entryKey) => {
        if (map.has(entryKey)) return;
        const [name, value] = entryKey.split("::");
        map.set(entryKey, { value: entryKey, label: `${name}: ${value}` });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [localProducts]);

  const allCollections = useMemo(() => {
    const map = new Map();
    localProducts.forEach((p) => {
      p.node.collections?.edges?.forEach(({ node: c }) => {
        if (!map.has(c.id)) map.set(c.id, c);
      });
    });
    return Array.from(map.values());
  }, [localProducts]);

  // URL-Params → Filter setzen (einmalig + bei collectionTitle warten bis allCollections geladen)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    const stock = params.get("stock");
    const status = params.get("status");
    const sale = params.get("sale");
    const noImages = params.get("noImages");
    const priceBucket = params.get("priceBucket");

    if (view === "low-stock" || stock) setStockBucketFilter(stock ?? "low-stock");
    if (status) setStatusFilter({ operator: "is", values: [status] });
    if (sale === "1") setSaleFilter(true);
    if (noImages === "1") setNoImagesFilter(true);
    if (priceBucket) setPriceBucketFilter(priceBucket);
  }, [location.search]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const collectionTitle = params.get("collectionTitle");
    if (!collectionTitle || allCollections.length === 0) return;
    const match = allCollections.find((c) => c.title === collectionTitle);
    if (match) setCollectionFilter({ operator: "is", values: [match.id] });
  }, [location.search, allCollections]);

  const filteredProducts = useMemo(() => {
    const directionFactor = sortDirection === "descending" ? -1 : 1;
    const getTime = (val) => val ? new Date(val).getTime() : 0;

    return localProducts
      .filter((p) => {
        if (!statusFilter.values.length) return true;
        const matches = statusFilter.values.map((v) => p?.node?.status === v);
        return statusFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        if (p?.node?.title?.toLowerCase().includes(q)) return true;
        if (p?.node?.seo?.title?.toLowerCase().includes(q)) return true;
        if (p?.node?.seo?.description?.toLowerCase().includes(q)) return true;
        const translatedContent = p?.node?.translatedContent ?? {};
        if (Object.values(translatedContent).some((c) =>
          c.title?.toLowerCase().includes(q) ||
          c.meta_title?.toLowerCase().includes(q) ||
          c.meta_description?.toLowerCase().includes(q)
        )) return true;
        if (productMetafieldValues(p).some((value) => value?.toLowerCase().includes(q))) return true;
        return productOptionValues(p).some((entryKey) => entryKey.toLowerCase().includes(q));
      })
      .filter((p) => !noTranslationFilter || (p?.node?.translatedLocaleCodes?.length ?? 0) === 0)
      .filter((p) => {
        if (!metafieldFilter.values.length) return true;
        const keys = productMetafieldFilterKeys(p);
        const matches = metafieldFilter.values.map((v) => keys.includes(v));
        return metafieldFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!collectionFilter.values.length) return true;
        const ids = p?.node?.collections?.edges?.map((e) => e.node.id) ?? [];
        const matches = collectionFilter.values.map((v) => v === "NONE" ? ids.length === 0 : ids.includes(v));
        return collectionFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!tagFilter.values.length) return true;
        const tags = p?.node?.tags ?? [];
        const matches = tagFilter.values.map((v) => v === "NONE" ? tags.length === 0 : tags.includes(v));
        return tagFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!variantFilter.values.length) return true;
        const optionCount = (p?.node?.options ?? []).filter((o) => o?.name !== "Title").length;
        const bucket = optionCount === 0 ? "NO_OPTIONS" : optionCount === 1 ? "ONE_OPTION" : "TWO_OPTIONS";
        const matches = variantFilter.values.map((v) => bucket === v);
        return variantFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!optionValueFilter.values.length) return true;
        const entries = productOptionValues(p);
        const matches = optionValueFilter.values.map((v) => entries.includes(v));
        return optionValueFilter.operator === "isNot" ? matches.every((m) => !m) : matches.some(Boolean);
      })
      .filter((p) => {
        if (!saleFilter) return true;
        return p?.node?.variants?.edges?.some((e) => e.node.compareAtPrice && parseFloat(e.node.compareAtPrice) > parseFloat(e.node.price));
      })
      .filter((p) => !noImagesFilter || !p?.node?.featuredImage?.url)
      .filter((p) => {
        if (!priceBucketFilter) return true;
        const lowest = Math.min(...(p?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
        if (priceBucketFilter === "under-25") return lowest < 25;
        if (priceBucketFilter === "25-49") return lowest >= 25 && lowest < 50;
        if (priceBucketFilter === "50-99") return lowest >= 50 && lowest < 100;
        if (priceBucketFilter === "100-199") return lowest >= 100 && lowest < 200;
        if (priceBucketFilter === "200-plus") return lowest >= 200;
        return true;
      })
      .filter((p) => {
        if (!stockBucketFilter) return true;
        const quantities = p?.node?.variants?.edges?.map((e) => Number(e.node.inventoryQuantity) || 0) ?? [];
        const anyOutOfStock = quantities.some((q) => q === 0);
        const anyLowStock = quantities.some((q) => q > 0 && q <= 5);
        const hasInventory = quantities.some((q) => q > 0);
        if (stockBucketFilter === "out-of-stock") return anyOutOfStock;
        if (stockBucketFilter === "low-stock") return anyLowStock;
        if (stockBucketFilter === "in-stock") return hasInventory;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "title") return a?.node?.title?.localeCompare(b?.node?.title ?? "") * directionFactor;
        if (sortBy === "createdAt") return (getTime(a?.node?.createdAt) - getTime(b?.node?.createdAt)) * directionFactor;
        if (sortBy === "price") {
          const pa = Math.min(...(a?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
          const pb = Math.min(...(b?.node?.variants?.edges?.map((e) => parseFloat(e.node.price) || 0) ?? [0]));
          return (pa - pb) * directionFactor;
        }
        return (getTime(a?.node?.updatedAt) - getTime(b?.node?.updatedAt)) * directionFactor;
      });
  }, [localProducts, query, statusFilter, collectionFilter, tagFilter, variantFilter, optionValueFilter, saleFilter, noImagesFilter, noTranslationFilter, metafieldFilter, priceBucketFilter, stockBucketFilter, sortBy, sortDirection]);

  return {
    query, setQuery,
    statusFilter, setStatusFilter,
    collectionFilter, setCollectionFilter,
    tagFilter, setTagFilter,
    variantFilter, setVariantFilter,
    optionValueFilter, setOptionValueFilter,
    allOptionValues,
    saleFilter, setSaleFilter,
    noImagesFilter, setNoImagesFilter,
    noTranslationFilter, setNoTranslationFilter,
    metafieldFilter, setMetafieldFilter,
    allMetafieldOptions,
    stockBucketFilter, setStockBucketFilter,
    priceBucketFilter, setPriceBucketFilter,
    sortBy, setSortBy,
    sortDirection, setSortDirection,
    filteredProducts,
    allTags,
    allCollections,
  };
}
