export function useProductContext({
    fetcher, setLocalProducts, setToast, metafields,
    setEditDescription, setEditTags, setEditId, setEditValue,
    setEditVariants, setEditOptions, setEditImages,
    setModalOpen, setDeleteId, setDeleteTitle, setDeleteModalOpen,
    openMenuId, setOpenMenuId,
  }) {
    return {
      onTitleSave: (id, newTitle) => {
        fetcher.submit({ action: "updateTitle", id, title: newTitle }, { method: "post" });
        setLocalProducts(prev => prev.map(p => p.node.id === id ? { node: { ...p.node, title: newTitle } } : p));
        setToast("Titel gespeichert ✅");
      },
  
      onStatusToggle: (id, currentStatus) => {
        const newStatus = currentStatus === "ACTIVE" ? "DRAFT" : "ACTIVE";
        fetcher.submit({ action: "updateStatus", id, status: newStatus }, { method: "post" });
        setLocalProducts(prev => prev.map(p => p.node.id === id ? { node: { ...p.node, status: newStatus } } : p));
        setToast(newStatus === "ACTIVE" ? "Produkt aktiviert ✅" : "Produkt auf Entwurf gesetzt 📝");
      },
  
      onMetafields: metafields.openMetafields,
  
      onEdit: (p) => {
        const mediaMap = {};
        p.node.media?.edges?.forEach(e => {
          if (e.node.image?.id) {
            mediaMap[e.node.image.id] = e.node.id;
            mediaMap[`gid://shopify/ProductImage/${e.node.image.id.split("/").pop()}`] = e.node.id;
          }
        });
        setEditDescription(p.node.description ?? "");
        setEditTags(p.node.tags ?? []);
        setEditId(p.node.id);
        setEditValue(p.node.title);
        setEditVariants(p.node.variants?.edges?.map(e => ({
          id: e.node.id,
          title: e.node.title,
          price: e.node.price,
          sku: e.node.sku ?? "",
          barcode: e.node.barcode ?? "",
          compareAtPrice: e.node.compareAtPrice ?? "", 
          inventoryQuantity: e.node.inventoryQuantity,
          inventoryItem: e.node.inventoryItem,
          selectedOptions: e.node.selectedOptions,
          imageId: e.node.image?.id ? (mediaMap[e.node.image.id] ?? null) : null,
          active: e.node.metafields?.edges?.find(m => m.node.key === "active")?.node.value !== "false",
        })) ?? []);
        setEditOptions(p.node.options
          ?.filter(o => !(o.name === "Title" && o.values.includes("Default Title")))
          ?.map(o => ({
            ...o,
            values: o.optionValues?.map(v => v.name) ?? o.values,
            activeValues: o.values,
            optionValueIds: o.optionValues?.reduce((acc, v) => ({ ...acc, [v.name]: v.id }), {}),
          })) ?? []
        );
        setEditImages(
          p.node.media?.edges
            ?.filter(e => e.node.image?.url)
            ?.map(e => ({ id: e.node.id, url: e.node.image?.url, altText: e.node.image?.altText })) ?? []
        );
        setModalOpen(true);
      },
  
      onDelete: (p) => {
        setDeleteId(p.node.id);
        setDeleteTitle(p.node.title);
        setDeleteModalOpen(true);
      },
  
      onDuplicate: (p) => {
        fetcher.submit({ action: "duplicate", id: p.node.id, title: p.node.title }, { method: "post" });
        setToast("Produkt wird dupliziert…");
      },
  
      openMenuId,
      setOpenMenuId,
    };
  }