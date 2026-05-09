export function useExport({ filteredProducts, setToast }) {
    const handleExport = () => {
      const headers = ["Produkt ID", "Titel", "Status", "Tags", "Collections", "Variante", "Preis", "Lager", "SKU"];
      const rows = [];
  
      filteredProducts.forEach(p => {
        const tags = (p.node.tags ?? []).join(", ");
        const collections = (p.node.collections?.edges ?? []).map(e => e.node.title).join(", ");
        const variants = p.node.variants?.edges ?? [];
  
        if (variants.length === 0) {
          rows.push([p.node.id, `"${p.node.title}"`, p.node.status, `"${tags}"`, `"${collections}"`, "", "", "", ""].join(";"));
        } else {
          variants.forEach((e, i) => {
            const v = e.node;
            rows.push([
              i === 0 ? p.node.id : "",
              i === 0 ? `"${p.node.title}"` : "",
              i === 0 ? p.node.status : "",
              i === 0 ? `"${tags}"` : "",
              i === 0 ? `"${collections}"` : "",
              `"${v.title}"`,
              `€${parseFloat(v.price).toFixed(2)}`,
              v.inventoryQuantity ?? 0,
              v.sku ?? "",
            ].join(";"));
          });
        }
      });
  
      const csv = [headers.join(";"), ...rows].join("\n");
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `produkte-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setToast("Export erfolgreich 📥");
    };
  
    return { handleExport };
  }