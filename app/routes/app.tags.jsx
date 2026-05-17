import { useState, useEffect, useRef } from "react";
import { useFetcher, useLoaderData, useSearchParams, useNavigate, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { tagsLoader } from "../loaders/tags.loader.server";
import { tagsAction } from "../actions/tags.action.server";
import { HashtagIcon, SearchIcon, PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import DeleteModal from "../components/shared/DeleteModal";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return tagsLoader({ request }, admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return tagsAction({ request }, admin);
};

export default function TagsPage() {
  const { tags: initialTags } = useLoaderData();
  const fetcher = useFetcher();
  const searchFetcher = useFetcher();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [tags, setTags] = useState(initialTags);
  const [toast, setToast] = useState(null);
  const [selectedNames, setSelectedNames] = useState([]);

  // Modals
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTag, setCreateTag] = useState("");
  const [assignOpen, setAssignOpen] = useState(false); // assign selected tags to products

  // Product search (used by create + assign modals)
  const [productSearch, setProductSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const searchTimer = useRef(null);

  useEffect(() => { setTags(initialTags); }, [initialTags]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const d = fetcher.data;
    if (d.error) { setToast(`Fehler: ${d.error}`); return; }
    if (d.success) {
      if (d.action === "renamed") {
        setTags((prev) => prev.map((t) => t.name === renameTarget ? { ...t, name: d.newTag } : t));
        setToast(`Tag umbenannt in „${d.newTag}" (${d.count} Produkte)`);
        setRenameTarget(null);
      }
      if (d.action === "deleted") {
        setTags((prev) => prev.filter((t) => t.name !== deleteTarget));
        setToast(`Tag gelöscht (${d.count} Produkte aktualisiert)`);
        setDeleteTarget(null);
      }
      if (d.action === "bulkDeleted") {
        setTags((prev) => prev.filter((t) => !selectedNames.includes(t.name)));
        setToast(`${d.count} Tags gelöscht`);
        setSelectedNames([]);
      }
      if (d.action === "created") {
        const exists = tags.find((t) => t.name === d.tag);
        if (!exists) setTags((prev) => [...prev, { name: d.tag, count: d.productCount }].sort((a, b) => a.name.localeCompare(b.name)));
        else setTags((prev) => prev.map((t) => t.name === d.tag ? { ...t, count: t.count + d.productCount } : t));
        setToast(`Tag „${d.tag}" erstellt und ${d.productCount} Produkten zugeordnet`);
        setCreateOpen(false); setCreateTag(""); setProductSearch(""); setSelectedProductIds([]);
      }
      if (d.action === "assigned") {
        setToast(`${d.tagCount} Tag${d.tagCount !== 1 ? "s" : ""} bei ${d.productCount} Produkten zugeordnet`);
        setAssignOpen(false); setProductSearch(""); setSelectedProductIds([]); setSelectedNames([]);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleSearch = (val) => {
    setSearch(val);
    const p = new URLSearchParams(searchParams);
    if (val) p.set("search", val); else p.delete("search");
    setSearchParams(p);
  };

  const toggleSelect = (name) =>
    setSelectedNames((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  const toggleAll = () =>
    setSelectedNames(selectedNames.length === tags.length ? [] : tags.map((t) => t.name));

  const submitRename = () => {
    if (!renameValue.trim() || !renameTarget) return;
    fetcher.submit({ intent: "rename", oldTag: renameTarget, newTag: renameValue.trim() }, { method: "post" });
  };
  const submitDelete = () => {
    fetcher.submit({ intent: "delete", tag: deleteTarget }, { method: "post" });
  };
  const submitBulkDelete = () => {
    fetcher.submit({ intent: "bulkDelete", tags: JSON.stringify(selectedNames) }, { method: "post" });
  };
  const submitCreate = () => {
    if (!createTag.trim() || !selectedProductIds.length) return;
    fetcher.submit({ intent: "create", tag: createTag.trim(), productIds: JSON.stringify(selectedProductIds) }, { method: "post" });
  };
  const submitAssign = () => {
    if (!selectedNames.length || !selectedProductIds.length) return;
    fetcher.submit({ intent: "assign", tags: JSON.stringify(selectedNames), productIds: JSON.stringify(selectedProductIds) }, { method: "post" });
  };

  const openProductSearch = () => {
    setProductSearch(""); setSelectedProductIds([]);
    searchFetcher.submit({ intent: "searchProducts", query: "" }, { method: "post" });
  };
  const handleProductSearch = (val) => {
    setProductSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchFetcher.submit({ intent: "searchProducts", query: val }, { method: "post" });
    }, 300);
  };
  const toggleProduct = (id) =>
    setSelectedProductIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const isBusy = fetcher.state !== "idle";
  const searchResults = searchFetcher.data?.products ?? [];
  const isSearching = searchFetcher.state !== "idle";

  return (
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <HashtagIcon width={24} height={24} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Tags</h1>
        <span style={{ fontSize: 13, color: "#888", marginLeft: 4 }}>{tags.length} Tags</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setCreateOpen(true); openProductSearch(); }} style={btnStyle("primary")}>
          <span style={{ display: "inline-flex", filter: "brightness(0) invert(1)" }}><PlusIcon width={16} height={16} /></span> Neuer Tag
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        Tags existieren in Shopify nur auf Produkten. Umbenennen und Löschen aktualisiert alle betroffenen Produkte.
      </p>

      {/* Suche */}
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 16 }}>
        <SearchIcon width={16} height={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
        <input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder="Tags suchen…"
          style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }} />
      </div>

      {/* Bulk-Bar */}
      {selectedNames.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 14px", background: "#fff", borderRadius: 8, border: "1px solid #e3e3e3" }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>{selectedNames.length} ausgewählt</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { setAssignOpen(true); openProductSearch(); }} style={btnStyle("secondary")}>Zu Produkten zuordnen</button>
          <button onClick={submitBulkDelete} disabled={isBusy} style={btnStyle("danger", isBusy)}>
            <DeleteIcon width={14} height={14} /> Löschen
          </button>
        </div>
      )}

      {/* Tabelle */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #e3e3e3" }}>
              <th style={{ ...thStyle, width: 40 }}>
                <input type="checkbox" checked={selectedNames.length === tags.length && tags.length > 0}
                  onChange={toggleAll} style={{ cursor: "pointer" }} />
              </th>
              <th style={thStyle}>Tag</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Produkte</th>
              <th style={{ ...thStyle, width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: "center", color: "#888" }}>Keine Tags gefunden</td></tr>
            )}
            {tags.map((tag) => (
              <TagRow
                key={tag.name}
                tag={tag}
                selected={selectedNames.includes(tag.name)}
                onToggle={() => toggleSelect(tag.name)}
                onOpen={() => navigate(`/app/tags/${encodeURIComponent(tag.name)}${location.search}`, { state: { from: `${location.pathname}${location.search}` } })}
                onRename={() => { setRenameTarget(tag.name); setRenameValue(tag.name); }}
                onDelete={() => setDeleteTarget(tag.name)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Rename Modal */}
      {renameTarget && (
        <Modal title={`„${renameTarget}" umbenennen`} onClose={() => setRenameTarget(null)}
          onConfirm={submitRename} confirmLabel="Speichern" disabled={isBusy || !renameValue.trim()}>
          <p style={{ margin: "0 0 12px", color: "#888", fontSize: 13 }}>Alle Produkte mit diesem Tag werden aktualisiert.</p>
          <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            placeholder="Neuer Tag-Name" style={inputStyle} />
        </Modal>
      )}

      {/* Delete Modal */}
      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
        description={`Tag „${deleteTarget}" wird von allen Produkten entfernt.`}
      />

      {/* Create Modal */}
      {createOpen && (
        <ProductPickerModal
          title="Neuer Tag"
          confirmLabel="Erstellen"
          disabled={isBusy || !createTag.trim() || !selectedProductIds.length}
          onClose={() => { setCreateOpen(false); setCreateTag(""); setProductSearch(""); setSelectedProductIds([]); }}
          onConfirm={submitCreate}
          productSearch={productSearch}
          onProductSearch={handleProductSearch}
          searchResults={searchResults}
          isSearching={isSearching}
          selectedProductIds={selectedProductIds}
          toggleProduct={toggleProduct}
        >
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Tag-Name</label>
            <input autoFocus value={createTag} onChange={(e) => setCreateTag(e.target.value)}
              placeholder="z.B. Sale, Neu, Bio…" style={inputStyle} />
          </div>
          <label style={labelStyle}>Produkte auswählen</label>
        </ProductPickerModal>
      )}

      {/* Assign Modal */}
      {assignOpen && (
        <ProductPickerModal
          title={`${selectedNames.length} Tag${selectedNames.length !== 1 ? "s" : ""} zuordnen`}
          confirmLabel="Zuordnen"
          disabled={isBusy || !selectedProductIds.length}
          onClose={() => { setAssignOpen(false); setProductSearch(""); setSelectedProductIds([]); }}
          onConfirm={submitAssign}
          productSearch={productSearch}
          onProductSearch={handleProductSearch}
          searchResults={searchResults}
          isSearching={isSearching}
          selectedProductIds={selectedProductIds}
          toggleProduct={toggleProduct}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {selectedNames.map((n) => (
              <span key={n} style={{ background: "#f0f0f0", borderRadius: 20, padding: "3px 10px", fontSize: 13 }}>#{n}</span>
            ))}
          </div>
          <label style={labelStyle}>Produkte auswählen</label>
        </ProductPickerModal>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "calc(220px + (100vw - 220px) / 2)", transform: "translateX(-50%)",
          background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Hilfskomponenten ──────────────────────────────────────────────────

function TagRow({ tag, selected, onToggle, onOpen, onRename, onDelete }) {
  const [hovered, setHovered] = useState(false);
  return (
    <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{ borderBottom: "1px solid #f0f0f0", background: selected ? "#f0f9ff" : hovered ? "#fafafa" : "#fff", cursor: "pointer" }}>
      <td style={{ padding: "12px 16px" }} onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggle} style={{ cursor: "pointer" }} />
      </td>
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <HashtagIcon width={14} height={14} style={{ opacity: 0.4, flexShrink: 0 }} />
          <span style={{ fontWeight: 500 }}>{tag.name}</span>
        </div>
      </td>
      <td style={{ ...tdStyle, textAlign: "right", color: "#6b7280" }}>{tag.count}</td>
      <td style={{ ...tdStyle, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
        {hovered && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <IconBtn icon={<EditIcon width={15} height={15} />} onClick={onRename} title="Umbenennen" />
            <IconBtn icon={<DeleteIcon width={15} height={15} />} onClick={onDelete} title="Löschen" danger />
          </div>
        )}
      </td>
    </tr>
  );
}

function Modal({ title, onClose, onConfirm, confirmLabel, disabled, children }) {
  return (
    <div style={overlayStyle}>
      <div style={modalBoxStyle}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{title}</h2>
        {children}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnStyle("secondary")}>Abbrechen</button>
          <button onClick={onConfirm} disabled={disabled} style={btnStyle("primary", disabled)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function ProductPickerModal({ title, confirmLabel, disabled, onClose, onConfirm, productSearch, onProductSearch, searchResults, isSearching, selectedProductIds, toggleProduct, children }) {
  return (
    <div style={overlayStyle}>
      <div style={{ ...modalBoxStyle, width: 540, maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{title}</h2>
        {children}
        <input value={productSearch} onChange={(e) => onProductSearch(e.target.value)}
          placeholder="Produkte suchen…" autoFocus={!children}
          style={{ ...inputStyle, marginBottom: 10 }} />
        <div style={{ flex: 1, overflowY: "auto", border: "1px solid #e3e3e3", borderRadius: 8, minHeight: 120, maxHeight: 300 }}>
          {isSearching
            ? <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Suche…</div>
            : searchResults.length === 0
              ? <div style={{ padding: 20, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Keine Produkte gefunden</div>
              : searchResults.map((p) => {
                  const checked = selectedProductIds.includes(p.id);
                  return (
                    <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px",
                      borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                      {p.featuredImage?.url
                        ? <img src={p.featuredImage.url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                        : <div style={{ width: 32, height: 32, borderRadius: 4, background: "#e5e7eb", flexShrink: 0 }} />}
                      <span style={{ fontSize: 14 }}>{p.title}</span>
                    </label>
                  );
                })
          }
        </div>
        {selectedProductIds.length > 0 && (
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>{selectedProductIds.length} Produkt{selectedProductIds.length !== 1 ? "e" : ""} ausgewählt</div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button onClick={onClose} style={btnStyle("secondary")}>Abbrechen</button>
          <button onClick={onConfirm} disabled={disabled} style={btnStyle("primary", disabled)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon, onClick, title, danger }) {
  return (
    <button onClick={onClick} title={title} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, borderRadius: 4, color: danger ? "#c0392b" : "#555", display: "flex", alignItems: "center" }}>
      {icon}
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const thStyle = { padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#555" };
const tdStyle = { padding: "12px 16px", fontSize: 14 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", outline: "none" };
const labelStyle = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalBoxStyle = { background: "#fff", borderRadius: 12, padding: 24, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" };

function btnStyle(variant, disabled) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500 };
  if (variant === "primary") return { ...base, background: disabled ? "#ccc" : "#303030", color: "#fff" };
  if (variant === "danger") return { ...base, background: disabled ? "#ccc" : "#fef2f2", color: disabled ? "#fff" : "#dc2626", border: "1px solid #fca5a5" };
  return { ...base, background: "#f0f0f0", color: "#333" };
}
