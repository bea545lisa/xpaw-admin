import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { collectionsLoader } from "../loaders/collections.loader.server";
import { collectionsAction } from "../actions/collections.action.server";
import { CollectionIcon, SearchIcon, PlusIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
import DeleteModal from "../components/shared/DeleteModal";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return collectionsLoader({ request }, admin);
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  return collectionsAction({ request }, admin);
};

export default function CollectionsPage() {
  const { collections } = useLoaderData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [toast, setToast] = useState(null);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");

  const [renameTarget, setRenameTarget] = useState(null); // { id, title }
  const [renameTitle, setRenameTitle] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title }

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetcher-Response verarbeiten
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const d = fetcher.data;
      if (d.success) {
        if (d.action === "created") setToast(`Kollektion „${d.title}" erstellt`);
        if (d.action === "renamed") setToast(`Umbenannt in „${d.title}"`);
        if (d.action === "deleted") setToast("Kollektion gelöscht");
        setCreateOpen(false);
        setCreateTitle("");
        setRenameTarget(null);
        setDeleteTarget(null);
      } else if (d.error) {
        setToast(`Fehler: ${d.error}`);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleSearch = (val) => {
    setSearch(val);
    const p = new URLSearchParams(searchParams);
    if (val) p.set("search", val);
    else p.delete("search");
    setSearchParams(p);
  };

  const submitCreate = () => {
    if (!createTitle.trim()) return;
    const fd = new FormData();
    fd.append("intent", "create");
    fd.append("title", createTitle.trim());
    fetcher.submit(fd, { method: "post" });
  };

  const submitRename = () => {
    if (!renameTitle.trim() || !renameTarget) return;
    const fd = new FormData();
    fd.append("intent", "rename");
    fd.append("id", renameTarget.id);
    fd.append("title", renameTitle.trim());
    fetcher.submit(fd, { method: "post" });
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("id", deleteTarget.id);
    fetcher.submit(fd, { method: "post" });
  };

  const isBusy = fetcher.state !== "idle";

  return (
    <div style={{ marginLeft: 220, padding: "32px 40px", minHeight: "100vh", background: "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <CollectionIcon width={24} height={24} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Kollektionen</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setCreateTitle(""); setCreateOpen(true); }} style={btnStyle("primary")}>
          <PlusIcon width={16} height={16} /> Neue Kollektion
        </button>
      </div>

      {/* Suche */}
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 20 }}>
        <SearchIcon width={16} height={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Kollektionen suchen…"
          style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }}
        />
      </div>

      {/* Tabelle */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
          <tr style={{ background: "#f9f9f9", borderBottom: "1px solid #e3e3e3" }}>
            <th style={thStyle}>Titel</th>
            <th style={thStyle}>Produkte</th>
            <th style={thStyle}>Geändert am</th>
            <th style={{ ...thStyle, width: 80 }} />
          </tr>
          </thead>
          <tbody>
          {collections.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 32, textAlign: "center", color: "#888" }}>
                Keine Kollektionen gefunden
              </td>
            </tr>
          )}
          {collections.map((col) => (
            <CollectionRow
              key={col.id}
              collection={col}
              onRename={() => { setRenameTarget(col); setRenameTitle(col.title); }}
              onDelete={() => setDeleteTarget(col)}
            />
          ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {createOpen && (
        <Modal
          title="Neue Kollektion"
          onClose={() => setCreateOpen(false)}
          onConfirm={submitCreate}
          confirmLabel="Erstellen"
          disabled={isBusy || !createTitle.trim()}
        >
          <input
            autoFocus
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitCreate()}
            placeholder="Titel der Kollektion"
            style={inputStyle}
          />
        </Modal>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <Modal
          title={`„${renameTarget.title}" umbenennen`}
          onClose={() => setRenameTarget(null)}
          onConfirm={submitRename}
          confirmLabel="Speichern"
          disabled={isBusy || !renameTitle.trim()}
        >
          <input
            autoFocus
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            placeholder="Neuer Titel"
            style={inputStyle}
          />
        </Modal>
      )}

      {/* Delete Modal */}
      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget?.title}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
      />

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20,
          left: "calc(220px + (100vw - 220px) / 2)",
          transform: "translateX(-50%)",
          background: "#303030", color: "white",
          padding: "12px 16px", borderRadius: 8,
          zIndex: 9999, whiteSpace: "nowrap",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Hilfskomponenten ──────────────────────────────────────────────────

function CollectionRow({ collection, onRename, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ borderBottom: "1px solid #f0f0f0", transition: "background 0.1s", background: hovered ? "#fafafa" : "#fff" }}
    >
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {collection.image?.url ? (
            <img src={collection.image.url} alt={collection.image.altText || ""} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: "#e3e3e3", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CollectionIcon width={18} height={18} style={{ opacity: 0.4 }} />
            </div>
          )}
          <span style={{ fontWeight: 500 }}>{collection.title}</span>
        </div>
      </td>
      <td style={tdStyle}>{collection.productsCount?.count ?? "—"}</td>
      <td style={tdStyle}>{new Date(collection.updatedAt).toLocaleDateString("de-DE")}</td>
      <td style={{ ...tdStyle, textAlign: "right" }}>
        {hovered && (
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <IconBtn icon={<EditIcon width={16} height={16} />} onClick={onRename} title="Umbenennen" />
            <IconBtn icon={<DeleteIcon width={16} height={16} />} onClick={onDelete} title="Löschen" danger />
          </div>
        )}
      </td>
    </tr>
  );
}

function Modal({ title, onClose, onConfirm, confirmLabel, disabled, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{title}</h2>
        {children}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnStyle("secondary")}>Abbrechen</button>
          <button onClick={onConfirm} disabled={disabled} style={btnStyle("primary", disabled)}>
            {confirmLabel}
          </button>
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

function btnStyle(variant, disabled) {
  const base = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500 };
  if (variant === "primary") return { ...base, background: disabled ? "#ccc" : "#303030", color: "#fff" };
  return { ...base, background: "#f0f0f0", color: "#333" };
}
