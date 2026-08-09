/* eslint-disable react-hooks/exhaustive-deps */
import { useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";

export function useCollections({ productId, setLocalProducts }) {

  const searchFetcher = useFetcher();      // nur für Suche
  const collectionsFetcher = useFetcher(); // nur für getProductCollections
  const actionFetcher = useFetcher();      // für add/remove

  const [productCollections, setProductCollections] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchTimer = useRef(null);

  // Suche öffnen — sofort erste 20 laden
  const handleSearchFocus = () => {
    // Nicht sofort öffnen — erst wenn Daten geladen
    if (searchResults.length > 0) {
      setIsSearchOpen(true);
    } else {
      searchFetcher.submit(
        { action: "searchCollections", query: "" },
        { method: "POST" }
      );
      // setIsSearchOpen wird im useEffect aufgerufen wenn Daten da
    }
  };

  // Produkt-Collections laden
  useEffect(() => {
    if (!productId) return;
    collectionsFetcher.submit(
      { action: "getProductCollections", productId },
      { method: "POST" }
    );
  }, [productId]);

  // Collections-Response verarbeiten
  useEffect(() => {
    if (collectionsFetcher.state !== "idle" || !collectionsFetcher.data) return;
    if (collectionsFetcher.data.type === "getProductCollections") {
      setProductCollections(collectionsFetcher.data.collections);
    }
  }, [collectionsFetcher.state, collectionsFetcher.data]);

  // Suchergebnisse verarbeiten
  useEffect(() => {
    if (searchFetcher.state !== "idle" || !searchFetcher.data) return;
    if (searchFetcher.data.type === "searchCollections") {
      setSearchResults(searchFetcher.data.collections.filter(
        c => !productCollections.some(pc => pc.id === c.id)
      ));
      setIsSearchOpen(true);  // ← erst öffnen wenn Daten da sind
    }
  }, [searchFetcher.state, searchFetcher.data]);

  // Action-Ergebnisse verarbeiten
  useEffect(() => {
    if (actionFetcher.state !== "idle" || !actionFetcher.data) return;
    const data = actionFetcher.data;

    if (data.type === "addToCollection") {
      setProductCollections(prev => [...prev, data.collection]);
      setSearchResults(prev => prev.filter(c => c.id !== data.collection.id));
      setSearchQuery("");
      setIsSearchOpen(false);

      // Verzögert damit Modal-Render nicht unterbrochen wird
      setTimeout(() => {
        setLocalProducts?.(prev => prev.map(p =>
          p.node.id === productId
            ? {
                node: {
                  ...p.node,
                  collections: {
                    edges: [
                      ...(p.node.collections?.edges ?? []),
                      { node: data.collection }
                    ]
                  }
                }
              }
            : p
        ));
      }, 100);
    }

    if (data.type === "removeFromCollection") {
      setProductCollections(prev => prev.filter(c => c.id !== data.collectionId));

      setTimeout(() => {
        setLocalProducts?.(prev => prev.map(p =>
          p.node.id === productId
            ? {
                node: {
                  ...p.node,
                  collections: {
                    edges: (p.node.collections?.edges ?? []).filter(
                      e => e.node.id !== data.collectionId
                    )
                  }
                }
              }
            : p
        ));
      }, 100);
    }
  }, [actionFetcher.state, actionFetcher.data]);

  // Suche mit Debounce
  const handleSearch = (query) => {

    setSearchQuery(query);
    clearTimeout(searchTimer.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchFetcher.submit(
        { action: "searchCollections", query },
        { method: "POST" }
      );
    }, 300);
  };

  const addToCollection = (collection) => {
    actionFetcher.submit(
      { action: "addToCollection", productId, collectionId: collection.id },
      { method: "POST" }
    );
  };

  const removeFromCollection = (collectionId) => {
    actionFetcher.submit(
      { action: "removeFromCollection", productId, collectionId },
      { method: "POST" }
    );
  };

  return {
    productCollections,
    searchResults,
    searchQuery,
    isSearchOpen, setIsSearchOpen,
    handleSearch, handleSearchFocus,
    addToCollection,
    removeFromCollection,
    isSearching: searchFetcher.state !== "idle",
    isUpdating: actionFetcher.state !== "idle",
  };
}
