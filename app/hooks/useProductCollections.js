import { useState, useRef, useMemo, useEffect } from "react";
import { useFetcher } from "react-router";

export function useProductCollections({ initialCollections, allCollections, fetcher, productId }) {
  const [localCollections, setLocalCollections] = useState(initialCollections ?? []);
  const [collectionSearch, setCollectionSearch] = useState("");
  const [showCollectionSearch, setShowCollectionSearch] = useState(false);
  const [collectionResults, setCollectionResults] = useState(allCollections ?? []);
  const collectionInputRef = useRef(null);
  const collectionSearchFetcher = useFetcher();  // ← eigener Fetcher für Suche

  // Suchergebnisse vom Server übernehmen
  useEffect(() => {
    if (collectionSearchFetcher.data?.type === "searchCollections") {
      setCollectionResults(collectionSearchFetcher.data.collections ?? []);
    }
  }, [collectionSearchFetcher.data]);

  // allCollections zurücksetzen wenn sich die Loader-Daten ändern
  useEffect(() => {
    setCollectionResults(allCollections);
  }, [allCollections]);

  // Debounced Suche
  useEffect(() => {
    if (!showCollectionSearch) return;
    const t = setTimeout(() => {
      collectionSearchFetcher.submit(
        { action: "searchCollections", query: collectionSearch },
        { method: "POST" }
      );
    }, collectionSearch.trim().length > 0 ? 250 : 0);
    return () => clearTimeout(t);
  }, [collectionSearch, showCollectionSearch]);

  const filteredCollectionSuggestions = useMemo(() =>
    collectionResults.filter(
      (c) => c.title.toLowerCase().includes(collectionSearch.toLowerCase()) &&
        !localCollections.find((lc) => lc.id === c.id)
    ), [collectionResults, collectionSearch, localCollections]);

  const handleCollectionAdd = (collection) => {
    setLocalCollections((prev) => {
      if (prev.find((c) => c.id === collection.id)) return prev;
      return [...prev, collection];
    });
    setCollectionSearch("");
    setShowCollectionSearch(false);
    fetcher.submit(
      { action: "addToCollection", collectionId: collection.id, collectionTitle: collection.title, productId },
      { method: "POST" }
    );
  };

  const handleCollectionRemove = (collectionId) => {
    setLocalCollections((prev) => prev.filter((c) => c.id !== collectionId));
    fetcher.submit(
      { action: "removeFromCollection", collectionId, productId },
      { method: "POST" }
    );
  };

  return {
    localCollections, collectionSearch, setCollectionSearch,
    showCollectionSearch, setShowCollectionSearch,
    collectionResults, setCollectionResults,
    collectionInputRef, filteredCollectionSuggestions,
    handleCollectionAdd, handleCollectionRemove,
  };
}
