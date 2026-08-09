/* eslint-disable react-hooks/exhaustive-deps */
import { useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";

export function useMetafields() {
  const metafieldsFetcher = useFetcher();
  const prevState = useRef("idle");

  const [metafieldsModalOpen, setMetafieldsModalOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState(null);
  const [metafields, setMetafields] = useState([]);
  const [newMetafield, setNewMetafield] = useState({ namespace: "", key: "", value: "", type: "single_line_text_field" });

  const openMetafields = (productId) => {
    setActiveProductId(productId);
    metafieldsFetcher.submit({ action: "getMetafields", productId }, { method: "post" });
  };

  const saveMetafield = () => {
    metafieldsFetcher.submit(
      { action: "saveMetafield", productId: activeProductId, ...newMetafield },
      { method: "post" }
    );
  };

  const deleteMetafield = (metafieldId, namespace, key) => {
    metafieldsFetcher.submit(
      { action: "deleteMetafield", metafieldId, productId: activeProductId, namespace, key },
      { method: "post" }
    );
  };

  useEffect(() => {
    if (prevState.current !== "idle" && metafieldsFetcher.state === "idle" && metafieldsFetcher.data?.ok) {
      const data = metafieldsFetcher.data;

      if (data.type === "getMetafields") {
        setMetafields(data.metafields);
        setMetafieldsModalOpen(true);
      }
      if (data.type === "saveMetafield") {
        const saved = data.metafield;
        setMetafields(prev => {
          const exists = prev.find(m => m.id === saved.id);
          return exists ? prev.map(m => m.id === saved.id ? saved : m) : [...prev, saved];
        });
        setNewMetafield({ namespace: "", key: "", value: "", type: "single_line_text_field" });
      }
      if (data.type === "deleteMetafield") {
        setMetafields(prev => prev.filter(m => m.id !== data.metafieldId));
      }
    }
    prevState.current = metafieldsFetcher.state;
  }, [metafieldsFetcher.state]);

  return {
    metafieldsModalOpen, setMetafieldsModalOpen,
    activeProductId, metafields,
    newMetafield, setNewMetafield,
    openMetafields, saveMetafield, deleteMetafield,
  };
}
