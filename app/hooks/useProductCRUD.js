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
  const [isSaving, setIsSaving] = useState(false);

  const isUpdating = isSaving || (fetcher.state !== "idle" && fetcher.formData?.get("action") === "update");
  const isDeleting = fetcher.state !== "idle" && fetcher.formData?.get("action") === "delete";
  const isCreating = fetcher.state !== "idle" && fetcher.formData?.get("action") === "create";

  const handleUpdate = () => {
    setIsSaving(true);
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

  const handleDeleteConfirm = () => {
    if (!deleteId) return;
    fetcher.submit({ action: "delete", id: deleteId }, { method: "post" });
  };
  const prevData = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok && fetcher.data !== prevData.current) {
      prevData.current = fetcher.data;
      const data = fetcher.data;
      setIsSaving(false);

      const knownTypes = ["update", "delete", "create", "duplicate", "updateTitle", "updateStatus", "bulkDelete"];
      if (!knownTypes.includes(data.type)) return;

      if (data.type === "update") {
        onUpdateSuccess?.();
        setToast(`Produkt ${data.product?.title ?? editValue} gespeichert`);
        setLocalProducts(prev => {
          const next = prev.map((p) => (
            p.node.id === data.product.id || p.node.id === editId
              ? { node: data.product }
              : p
          ));
          return next.some((p) => p.node.id === data.product.id) ? next : [{ node: data.product }, ...next];
        });
      }
      if (data.type === "delete") {
        setDeleteModalOpen(false);
        setToast(`Produkt ${deleteTitle} gelöscht 🗑️`);
        setLocalProducts(prev => prev.filter(p => p.node.id !== data.id));
      }
      if (data.type === "create") {
        const product = {
          ...data.product,
          status: data.product?.status ?? "DRAFT",
          createdAt: data.product?.createdAt ?? new Date().toISOString(),
          updatedAt: data.product?.updatedAt ?? new Date().toISOString(),
        };
        setToast(`Produkt ${product.title} erstellt 🎉`);
        setLocalProducts(prev => [{ node: product }, ...prev]);
      }
      if (data.type === "duplicate") {
        const product = {
          ...data.product,
          status: data.product?.status ?? "DRAFT",
          createdAt: data.product?.createdAt ?? new Date().toISOString(),
          updatedAt: data.product?.updatedAt ?? new Date().toISOString(),
          title: String(data.product?.title ?? "").includes("*** KOPIE ***")
            ? data.product.title
            : `${String(data.product?.title ?? "").trim()} *** KOPIE ***`,
        };
        setToast(`${product.title} erstellt 🎉`);
        setLocalProducts(prev => [{ node: product }, ...prev]);
      }
    }
    if (fetcher.state === "idle" && prevState.current !== "idle") {
      setIsSaving(false);
    }
    prevState.current = fetcher.state;
  }, [fetcher.state, fetcher.data]);

  return {
    fetcher, localProducts, setLocalProducts,
    toast, setToast,
    modalOpen, setModalOpen,
    deleteModalOpen, setDeleteModalOpen,
    isUpdating, isDeleting, isCreating,
    handleUpdate, handleDelete, handleDeleteConfirm,
  };
}
