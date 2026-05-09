/* eslint-disable react-hooks/exhaustive-deps */
import { useFetcher } from "react-router";
import { useState, useEffect, useRef } from "react";

export function useProductCRUD({ 
  locationId, editId, editValue, editDescription, editVariants, editOptions, 
  deleteId, deleteTitle, onUpdateSuccess }) {

  const fetcher = useFetcher();
  const prevState = useRef("idle");

  const [localProducts, setLocalProducts] = useState([]);
  const [toast, setToast] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const isUpdating = fetcher.state !== "idle" && fetcher.formData?.get("action") === "update";
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("action") === "delete";
  const isCreating = fetcher.state !== "idle" && fetcher.formData?.get("action") === "create";

  const handleUpdate = () => {
    const variantsJson = JSON.stringify(editVariants);
    fetcher.submit(
      { 
        action: "update", 
        id: editId, 
        title: editValue, 
        description: editDescription,  
        variants: variantsJson, 
        options: JSON.stringify(editOptions), 
        locationId 
      },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    fetcher.submit({ action: "delete", id: deleteId }, { method: "post" });
  };
  const prevData = useRef(null);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data !== prevData.current) {
      prevData.current = fetcher.data;
      const data = fetcher.data;
  
      const knownTypes = ["update", "delete", "create", "duplicate", "updateTitle", "updateStatus", "bulkDelete"];
      if (!knownTypes.includes(data.type)) return;
  
      if (data.type === "update") {
        onUpdateSuccess?.();
        setLocalProducts(prev => {
          const updated = prev.map(p => p.node.id === data.product.id ? { node: data.product } : p);
          return updated;
        });
      }
      if (data.type === "delete") {
        setDeleteModalOpen(false);
        setToast(`Produkt ${deleteTitle} gelöscht 🗑️`);
        setLocalProducts(prev => prev.filter(p => p.node.id !== data.id));
      }
      if (data.type === "create") {
        setToast(`Produkt ${data.product.title} erstellt 🎉`);
        setLocalProducts(prev => [{ node: data.product }, ...prev]);
      }
      if (data.type === "duplicate") {
        setToast(`${data.product.title} erstellt 🎉`);
        setLocalProducts(prev => [{ node: data.product }, ...prev]);
      }
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data]);

  return {
    fetcher, localProducts, setLocalProducts,
    toast, setToast,
    modalOpen, setModalOpen,
    deleteModalOpen, setDeleteModalOpen,
    isUpdating, isDeleting, isCreating,
    handleUpdate, handleDelete,
  };
}
