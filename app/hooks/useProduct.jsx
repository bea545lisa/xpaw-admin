import { useState } from "react";

export function useProduct() {
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = (ids) => setSelectedIds(ids);
  const clearSelection = () => setSelectedIds([]);

  return { selectedIds, toggleSelect, clearSelection, selectAll };
}

