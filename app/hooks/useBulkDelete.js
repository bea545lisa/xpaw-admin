import { useState } from "react";

export function useBulkDelete({ localProducts, setLocalProducts, selectedIds, clearSelection, fetcher, setToast }) {
  const [pendingDeleteIds, setPendingDeleteIds] = useState([]);
  const [setSavedForUndo] = useState([]);
  const [undoTimer, setUndoTimer] = useState(null);
  const [progress, setProgress] = useState(0);
  const [restoredIds, setRestoredIds] = useState([]);

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    const idsToDelete = [...selectedIds];
    const productsToDelete = localProducts.filter(p => idsToDelete.includes(p.node.id));

    setPendingDeleteIds(idsToDelete);
    setSavedForUndo(productsToDelete);
    clearSelection();
    setProgress(100);

    const interval = setInterval(() => setProgress(prev => prev - 20), 1000);

    const timer = setTimeout(() => {
      clearInterval(interval);
      setLocalProducts(prev => prev.filter(p => !idsToDelete.includes(p.node.id)));
      fetcher.submit({ action: "bulkDelete", ids: JSON.stringify(idsToDelete) }, { method: "post" });
      setToast(`${idsToDelete.length} Produkte gelöscht 🗑️`);
      setPendingDeleteIds([]);
      setProgress(0);
    }, 5000);

    setUndoTimer(timer);
  };

  const handleUndo = () => {
    clearTimeout(undoTimer);
    setRestoredIds(pendingDeleteIds);
    setPendingDeleteIds([]);
    setSavedForUndo([]);
    setProgress(0);
    setTimeout(() => setRestoredIds([]), 400);
  };

  return { pendingDeleteIds, progress, restoredIds, handleBulkDelete, handleUndo };
}
