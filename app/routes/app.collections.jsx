import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useSearchParams, useNavigate, useLocation } from "react-router";
import { authenticate } from "../shopify.server";
import { useColorScheme } from "../context/ColorSchemeContext";
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
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { collections } = useLoaderData();
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const location = useLocation();
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
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <span style={{ display: "flex", fill: isDark ? "#f3f4f6" : "#555" }}><CollectionIcon width={24} height={24} /></span>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Kollektionen</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => { setCreateTitle(""); setCreateOpen(true); }} style={btnStyle("primary")}>
          <span style={{ display: "inline-flex", filter: "brightness(0) invert(1)" }}><PlusIcon width={16} height={16} /></span> Neue Kollektion
        </button>
      </div>

      {/* Suche */}
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 20 }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex", fill: isDark ? "#b0b7c3" : "#9ca3af" }}><SearchIcon width={16} height={16} /></span>
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Kollektionen suchen…"
          style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: `1px solid ${isDark ? "#3a3a3a" : "#ddd"}`, fontSize: 14, boxSizing: "border-box", background: isDark ? "#1e1e1e" : "#fff", color: isDark ? "#e5e7eb" : "#111" }}
        />
      </div>

      {/* Tabelle */}
      <div style={{ background: isDark ? "#1a1a1a" : "#fff", borderRadius: 12, border: `1px solid ${isDark ? "#444" : "#e3e3e3"}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
          <tr style={{ background: isDark ? "#222" : "#f9f9f9", borderBottom: `1px solid ${isDark ? "#444" : "#e3e3e3"}` }}>
            <th style={thStyle}>Titel</th>
            <th style={thStyle}>Beschreibung</th>
            <th style={thStyle}>Produkte</th>
            <th style={thStyle}>Geändert am</th>
            <th style={{ ...thStyle, width: 72, minWidth: 72, padding: "10px 8px" }} />
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
          {collections.map((col, i) => (
            <CollectionRow
              key={col.id}
              collection={col}
              isDark={isDark}
              index={i}
              onRename={() => { setRenameTarget(col); setRenameTitle(col.title); }}
              onDelete={() => setDeleteTarget(col)}
              onOpen={() => navigate(`/app/collections/${col.id.split("/").pop()}`, { state: { from: `${location.pathname}${location.search}` } })}
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

function CollectionRow({ collection, isDark, onRename, onDelete, onOpen, index }) {
  const [hovered, setHovered] = useState(false);

  const description = collection.descriptionHtml
    ? collection.descriptionHtml.replace(/<[^>]+>/g, "").trim()
    : null;

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{ borderBottom: `1px solid ${isDark ? "#3a3a3a" : "#f0f0f0"}`, transition: "background 0.1s", background: hovered ? (isDark ? "#222222" : "#fafafa") : (isDark ? (index % 2 === 0 ? "#2f2f2f" : "#282828") : "#fff"), cursor: "pointer" }}
    >
      <td style={tdStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {collection.image?.url ? (
            <img src={collection.image.url} alt={collection.image.altText || ""} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36, height: 36, borderRadius: 6, background: isDark ? "#333" : "#e3e3e3", flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 500 }}>{collection.title}</span>
        </div>
      </td>
      <td style={{ ...tdStyle, color: isDark ? "#9ca3af" : "#6b7280", maxWidth: 300 }}>
        {description ? (
          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {description}
          </span>
        ) : (
          <span style={{ color: isDark ? "#4b5563" : "#d1d5db" }}>—</span>
        )}
      </td>
      <td style={tdStyle}>{collection.productsCount?.count ?? "—"}</td>
      <td style={tdStyle}>{new Date(collection.updatedAt).toLocaleDateString("de-DE")}</td>
      <td style={{ ...tdStyle, width: 72, minWidth: 72, padding: "12px 8px" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", visibility: hovered ? "visible" : "hidden" }}>
          <IconBtn icon={<EditIcon width={16} height={16} />} onClick={onRename} title="Umbenennen" isDark={isDark} />
          <IconBtn icon={<DeleteIcon width={16} height={16} />} onClick={onDelete} title="Löschen" danger isDark={isDark} />
        </div>
      </td>
    </tr>
  );
}

function Modal({ title, onClose, onConfirm, confirmLabel, disabled, children }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ background: isDark ? "#1e1e1e" : "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", border: isDark ? "1px solid #333" : "none" }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>{title}</h2>
        {children}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnStyle("secondary", false, isDark)}>Abbrechen</button>
          <button onClick={onConfirm} disabled={disabled} style={btnStyle("primary", disabled, isDark)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ icon, onClick, title, danger, isDark }) {
  return (
    <button onClick={onClick} title={title}
      className={`icon-btn${danger ? " icon-btn-danger" : ""}`}
      style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, borderRadius: 4, color: danger ? "#e57373" : (isDark ? "#c4c7cc" : "#555"), display: "flex", alignItems: "center" }}>
      {icon}
    </button>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const thStyle = { padding: "10px 16px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#555" };
const tdStyle = { padding: "12px 16px", fontSize: 14 };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box", outline: "none" };

function btnStyle(variant, disabled, d) {
  const base = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500 };
  if (variant === "primary") return { ...base, background: disabled ? (d ? "#3a3a3a" : "#ccc") : "#303030", color: disabled ? (d ? "#666" : "#fff") : "#fff" };
  return { ...base, background: "#f0f0f0", color: "#333" };
}
