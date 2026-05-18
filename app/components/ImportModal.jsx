import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "react-router";
import { generateSku } from "../utils/skuAbbreviation.js";
import { Badge, BlockStack, Button, Checkbox, InlineStack, Text } from "@shopify/polaris";

// ── CSV parsen ────────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());

  const get = (cols, i) => i >= 0 ? (cols[i]?.replace(/^"|"$/g, "").trim() ?? "") : "";

  const idx = {
    id:             headers.indexOf("produkt id"),
    title:          headers.indexOf("titel"),
    status:         headers.indexOf("status"),
    tags:           headers.indexOf("tags"),
    collections:    headers.indexOf("collections"),
    skuPrefix:      headers.indexOf("sku präfix"),
    price:          headers.indexOf("preis"),
    compareAtPrice: headers.indexOf("vergleichspreis"),
    inventory:      headers.indexOf("lager"),
    sku:            headers.indexOf("sku"),
  };

  // Option-Spalten dynamisch erkennen: "option1 name", "option1 wert", ...
  const optionCount = Math.max(0, ...headers
    .map(h => { const m = h.match(/^option(\d+) name$/); return m ? parseInt(m[1]) : 0; })
  );

  const products = [];
  let current = null;

  lines.slice(1).forEach(line => {
    if (!line.trim()) return;
    const cols = line.split(sep);

    const id    = get(cols, idx.id);
    const title = get(cols, idx.title);

    // Options aus den dynamischen Spalten lesen
    const selectedOptions = [];
    for (let i = 1; i <= optionCount; i++) {
      const nameIdx  = headers.indexOf(`option${i} name`);
      const valueIdx = headers.indexOf(`option${i} wert`);
      const name  = get(cols, nameIdx);
      const value = get(cols, valueIdx);
      if (name && value) selectedOptions.push({ name, value });
    }

    const skuRaw   = get(cols, idx.sku);
    const skuPrefix = get(cols, idx.skuPrefix);
    // SKU aus Präfix generieren falls kein expliziter SKU angegeben
    const sku = skuRaw || (skuPrefix && selectedOptions.length > 0
      ? generateSku(skuPrefix, selectedOptions.map(o => o.value))
      : skuRaw);

    const variant = {
      selectedOptions,
      price:          get(cols, idx.price),
      compareAtPrice: get(cols, idx.compareAtPrice),
      inventory:      get(cols, idx.inventory),
      sku,
    };

    if (title || id) {
      // Neue Produkt-Zeile (oder Folgezeile mit wiederholtem Titel → gleiche Gruppe)
      const existing = products.find(p => (p.id && p.id === id) || (!id && p.title === title));
      if (existing) {
        existing.variants.push(variant);
        // Tags + Collections aus Folgezeilen ergänzen (Union, keine Duplikate)
        const mergeField = (existing, raw) => {
          if (!raw) return existing;
          const set = new Set((existing ?? "").split(/[|,]/).map(c => c.trim()).filter(Boolean));
          raw.split(/[|,]/).map(c => c.trim()).filter(Boolean).forEach(c => set.add(c));
          return [...set].join(" | ");
        };
        existing.collections = mergeField(existing.collections, get(cols, idx.collections));
        existing.tags        = mergeField(existing.tags,        get(cols, idx.tags));
      } else {
        current = {
          id, title,
          rawStatus:   get(cols, idx.status),
          tags:        get(cols, idx.tags),
          collections: get(cols, idx.collections),
          status:      "new",
          variants:    [variant],
        };
        products.push(current);
      }
    } else if (current && (variant.selectedOptions.length > 0 || variant.sku || variant.price)) {
      // Folgezeile ohne Titel/ID → Variante des letzten Produkts
      current.variants.push(variant);
    }
  });

  return products;
}

// ── Status-Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, matchedBy }) {
  if (status === "new")       return <Badge tone="success">Neu</Badge>;
  if (status === "update")    return <Badge tone="info">Update via {matchedBy ?? "ID"}</Badge>;
  if (status === "duplicate") return <Badge tone="warning">Gleicher Titel – prüfen</Badge>;
  return <Badge tone="attention">Prüft…</Badge>;
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function ImportModal({ open, onClose, fetcher, setToast }) {
  const fileRef   = useRef(null);
  const [step, setStep]               = useState("upload"); // upload | preview | importing | done
  const [parsedProducts, setParsedProducts] = useState([]);
  const [checkedProducts, setCheckedProducts] = useState([]);
  const [skipDuplicates, setSkipDuplicates]   = useState(true);
  const [result, setResult]           = useState(null);
  const [dragOver, setDragOver]       = useState(false);

  const checkFetcher  = useFetcher();
  const importFetcher = useFetcher();

  const isChecking  = checkFetcher.state !== "idle";
  const isImporting = importFetcher.state !== "idle";

  const reset = () => {
    setStep("upload");
    setParsedProducts([]);
    setCheckedProducts([]);
    setResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const products = parseCsv(e.target.result);
      if (products.length === 0) {
        setToast("Keine gültigen Zeilen gefunden. Bitte Format prüfen.");
        return;
      }
      setParsedProducts(products);
      setStep("preview");

      // Duplikat-Check ans Server schicken
      const fd = new FormData();
      fd.append("action", "checkImport");
      fd.append("rows", JSON.stringify(products));
      checkFetcher.submit(fd, { method: "post", action: "/app/products" });
    };
    reader.readAsText(file, "UTF-8");
  };

  // Ergebnis des Duplikat-Checks verarbeiten
  const displayProducts = checkFetcher.data?.results ?? parsedProducts;

  const newCount       = displayProducts.filter(p => p.status === "new").length;
  const updateCount    = displayProducts.filter(p => p.status === "update").length;
  const duplicateCount = displayProducts.filter(p => p.status === "duplicate").length;
  const importCount    = displayProducts.filter(p =>
    p.status === "new" || p.status === "update" || (!skipDuplicates && p.status === "duplicate")
  ).length;

  const handleImport = () => {
    const toImport = displayProducts.filter(p =>
      p.status === "new" || p.status === "update" || (!skipDuplicates && p.status === "duplicate")
    );
    const fd = new FormData();
    fd.append("action", "executeImport");
    fd.append("products", JSON.stringify(toImport));
    fd.append("skipDuplicates", String(skipDuplicates));
    importFetcher.submit(fd, { method: "post", action: "/app/products" });
    setStep("importing");
  };

  // Import-Ergebnis verarbeiten
  if (step === "importing" && importFetcher.state === "idle" && importFetcher.data) {
    const r = importFetcher.data;
    setResult(r);
    setStep("done");
    if (r.created > 0 || r.updated > 0) {
      setToast(`Import abgeschlossen: ${r.created} erstellt, ${r.updated} aktualisiert, ${r.skipped} übersprungen`);
    }
  }

  if (!open) return null;

  const modal = (
    <div className="im-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="im-modal">

        {/* Header */}
        <div className="im-header">
          <Text variant="headingMd" as="h2">Produkte importieren</Text>
          <button className="im-close" onClick={handleClose}>×</button>
        </div>

        {/* Body */}
        <div className="im-body">

          {/* Step: Upload */}
          {step === "upload" && (
            <BlockStack gap="400">
              <div
                className={`im-dropzone ${dragOver ? "dragover" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              >
                <Text tone="subdued" as="p">CSV-Datei hier ablegen oder klicken zum Auswählen</Text>
                <input
                  ref={fileRef} type="file" accept=".csv"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files[0])}
                />
              </div>
              <div style={{ background: "#f6f6f7", borderRadius: 8, padding: "12px 16px" }}>
                <Text variant="bodySm" tone="subdued" as="p">
                  Erwartetes Format (Spalten durch <strong>;</strong> getrennt):
                </Text>
                <code style={{ fontSize: 11, display: "block", marginTop: 6, color: "#555", lineHeight: 1.6 }}>
                  Produkt ID;Titel;Status;Tags;Collections;Variante;Preis;Lager;SKU
                </code>
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Tags & Collections</strong> mehrere Werte durch <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>|</code> trennen — z.B. <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>Hunde | Sale</code>
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Varianten</strong>: jede Variante bekommt eine eigene Zeile mit Option-Name/-Wert (z.B. <code style={{ background: "#e5e7eb", padding: "1px 5px", borderRadius: 3 }}>Option1 Name: Farbe / Option1 Wert: Rot</code>). Produktfelder können in jeder Zeile wiederholt oder leer gelassen werden.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Neue Option-Werte</strong> (z.B. neue Farbe) werden von Shopify automatisch angelegt
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>SKU ist der Schlüssel</strong> für Synchronisation — Produkt mit bekannter SKU wird automatisch aktualisiert, unbekannte SKU legt ein neues Produkt an. Externe Systeme (ERP, Kassensystem) müssen keine Shopify-IDs kennen.
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • <strong>Produkt ID</strong> optional — nur beim Export→Reimport-Workflow automatisch befüllt
                  </Text>
                  <Text variant="bodySm" tone="subdued" as="p">
                    • Tipp: Erst <strong>exportieren</strong>, in Excel bearbeiten, dann reimportieren
                  </Text>
                </div>
              </div>
            </BlockStack>
          )}

          {/* Step: Vorschau */}
          {step === "preview" && (
            <BlockStack gap="300">
              {isChecking && (
                <div style={{ padding: "8px 0", color: "#888", fontSize: 13 }}>
                  Duplikate werden geprüft…
                </div>
              )}

              {/* Zusammenfassung */}
              <InlineStack gap="300">
                <Badge tone="success">{newCount} Neu</Badge>
                {updateCount > 0 && <Badge tone="info">{updateCount} Update</Badge>}
                {duplicateCount > 0 && <Badge tone="warning">{duplicateCount} Vorhanden</Badge>}
              </InlineStack>

              {duplicateCount > 0 && (
                <Checkbox
                  label={`${duplicateCount} Produkte mit gleichem Titel überspringen (unsichere Übereinstimmung)`}
                  checked={skipDuplicates}
                  onChange={setSkipDuplicates}
                />
              )}

              {/* Tabelle */}
              <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e3e3e3", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                      {["Titel", "Status", "Varianten", "Duplikat-Check"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayProducts.map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f3f4f6", opacity: (skipDuplicates && p.status === "duplicate") ? 0.4 : 1 }}>
                        <td style={{ padding: "8px 12px", fontWeight: 500 }}>{p.title || "—"}</td>
                        <td style={{ padding: "8px 12px", color: "#888" }}>{p.rawStatus || "DRAFT"}</td>
                        <td style={{ padding: "8px 12px", color: "#888" }}>{p.variants?.length ?? 1}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <StatusBadge status={p.status} matchedBy={p.matchedBy} />
                          {p.existingTitle && p.status === "duplicate" && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "#888" }}>→ {p.existingTitle}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </BlockStack>
          )}

          {/* Step: Importing */}
          {step === "importing" && (
            <div style={{ padding: "24px 0", textAlign: "center" }}>
              <Text as="p">Import läuft…</Text>
              <div style={{ marginTop: 12, height: 4, background: "#e3e3e3", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: "#4ea1ff", animation: "im-progress 1.5s ease-in-out infinite" }} />
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && result && (
            <BlockStack gap="300">
              <InlineStack gap="300">
                {result.created > 0 && <Badge tone="success">{result.created} erstellt</Badge>}
                {result.updated > 0 && <Badge tone="info">{result.updated} aktualisiert</Badge>}
                {result.skipped > 0 && <Badge tone="attention">{result.skipped} übersprungen</Badge>}
              </InlineStack>
              {result.errors?.length > 0 && (
                <div style={{ background: "#fff5f5", border: "1px solid #fca5a5", borderRadius: 8, padding: 12 }}>
                  <Text variant="bodySm" as="p" tone="critical">Fehler bei {result.errors.length} Produkt(en):</Text>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 12, marginTop: 4, color: "#b91c1c" }}>
                      <strong>{e.title}</strong>: {e.errors.join(", ")}
                    </div>
                  ))}
                </div>
              )}
            </BlockStack>
          )}
        </div>

        {/* Footer */}
        <div className="im-footer">
          {step === "upload" && (
            <Button onClick={handleClose}>Abbrechen</Button>
          )}
          {step === "preview" && (
            <InlineStack gap="200">
              <Button onClick={reset}>Zurück</Button>
              <Button
                variant="primary"
                disabled={isChecking || importCount === 0}
                onClick={handleImport}
              >
                {importCount} Produkt{importCount !== 1 ? "e" : ""} importieren
              </Button>
            </InlineStack>
          )}
          {step === "done" && (
            <InlineStack gap="200">
              <Button onClick={reset}>Weiteren Import</Button>
              <Button variant="primary" onClick={handleClose}>Fertig</Button>
            </InlineStack>
          )}
        </div>
      </div>

      <style>{`
        .im-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 9999; }
        .im-modal { background: #fff; border-radius: 12px; width: min(640px, calc(100vw - 32px)); max-height: calc(100vh - 64px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
        .im-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #e5e7eb; }
        .im-close { background: none; border: none; font-size: 22px; cursor: pointer; color: #9ca3af; line-height: 1; padding: 0 4px; }
        .im-close:hover { color: #374151; }
        .im-body { flex: 1; overflow-y: auto; padding: 20px; }
        .im-footer { padding: 12px 20px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; }
        .im-dropzone { border: 2px dashed #d1d5db; border-radius: 10px; padding: 40px 20px; text-align: center; cursor: pointer; transition: border-color 0.15s, background 0.15s; }
        .im-dropzone:hover, .im-dropzone.dragover { border-color: #4ea1ff; background: #f0f7ff; }
        @keyframes im-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      `}</style>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
