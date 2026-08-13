// Excel wandelt lange Zahlen (wie die Produkt-ID) beim Öffnen einer CSV automatisch in
// wissenschaftliche Notation um (z.B. 9,41387E+12) und verliert dabei Stellen. Als
// ="..."-Formel bleibt der Wert garantiert als Text erhalten.
function asExcelText(value) {
  return `="${value}"`;
}

export function useExport({ filteredProducts, setToast }) {
  const handleExport = () => {
    // Maximale Anzahl Optionen über alle Produkte ermitteln (meist 1–3)
    let maxOptions = 1;
    filteredProducts.forEach(p => {
      const opts = p.node.options ?? [];
      if (opts.length > maxOptions) maxOptions = opts.length;
    });

    // Spalten-Header
    const optionHeaders = [];
    for (let i = 1; i <= maxOptions; i++) {
      optionHeaders.push(`Option${i} Name`, `Option${i} Wert`);
    }
    const headers = [
      "Produkt ID", "Titel", "Status", "Tags", "Collections",
      ...optionHeaders,
      "Preis", "Vergleichspreis", "Lager", "SKU",
    ];

    const rows = [];

    filteredProducts.forEach(p => {
      const node     = p.node;
      const tags        = (node.tags ?? []).join(" | ");
      const collections = (node.collections?.edges ?? []).map(e => e.node.title).join(" | ");
      const variants    = node.variants?.edges ?? [];
      const options     = node.options ?? [];

      if (variants.length === 0) {
        const optCols = Array(maxOptions * 2).fill("");
        rows.push([
          asExcelText(node.id.split("/").pop()), `"${node.title}"`, node.status,
          `"${tags}"`, `"${collections}"`,
          ...optCols,
          "", "", "", "",
        ].join(";"));
        return;
      }

      variants.forEach(e => {
        const v = e.node;
        const selectedOptions = v.selectedOptions ?? [];

        // Option-Spalten: Name aus options[], Wert aus selectedOptions[]
        const optCols = [];
        for (let i = 0; i < maxOptions; i++) {
          const optName  = options[i]?.name ?? "";
          const optValue = selectedOptions[i]?.value ?? "";
          optCols.push(optName, optValue);
        }

        rows.push([
          asExcelText(node.id.split("/").pop()),
          `"${node.title}"`,
          node.status,
          `"${tags}"`,
          `"${collections}"`,
          ...optCols,
          parseFloat(v.price ?? 0).toFixed(2),
          v.compareAtPrice ? parseFloat(v.compareAtPrice).toFixed(2) : "",
          v.inventoryQuantity ?? 0,
          v.sku ?? "",
        ].join(";"));
      });
    });

    const csv = [headers.join(";"), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `produkte-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Export erfolgreich");
  };

  return { handleExport };
}
