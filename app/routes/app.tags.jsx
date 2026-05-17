import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { authenticate } from "../shopify.server";
import { tagsLoader } from "../loaders/tags.loader.server";
import { tagsAction } from "../actions/tags.action.server";
import { HashtagIcon, SearchIcon, EditIcon, DeleteIcon } from "@shopify/polaris-icons";
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
  const { tags } = useLoaderData();
  const fetcher = useFetcher();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [toast, setToast] = useState(null);

  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      const d = fetcher.data;
      if (d.success) {
        if (d.action === "renamed") setToast(`Tag umbenannt in „${d.newTag}" (${d.count} Produkte)`);
        if (d.action === "deleted") setToast(`Tag gelöscht (${d.count} Produkte aktualisiert)`);
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

  const submitRename = () => {
    if (!renameValue.trim() || !renameTarget) return;
    const fd = new FormData();
    fd.append("intent", "rename");
    fd.append("oldTag", renameTarget);
    fd.append("newTag", renameValue.trim());
    fetcher.submit(fd, { method: "post" });
  };

  const submitDelete = () => {
    if (!deleteTarget) return;
    const fd = new FormData();
    fd.append("intent", "delete");
    fd.append("tag", deleteTarget);
    fetcher.submit(fd, { method: "post" });
  };

  const isBusy = fetcher.state !== "idle";

  return (
    <div style={{ padding: "32px 40px", minHeight: "100vh", background: "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <HashtagIcon width={24} height={24} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Tags</h1>
        <span style={{ fontSize: 13, color: "#888", marginLeft: 4 }}>{tags.length} Tags</span>
      </div>

      {/* Hinweis */}
      <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>
        Tags existieren in Shopify nur auf Produkten. Umbenennen und Löschen aktualisiert alle betroffenen Produkte.
      </p>

      {/* Suche */}
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 24 }}>
        <SearchIcon width={16} height={16} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Tags suchen…"
          style={{ width: "100%", padding: "8px 12px 8px 32px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" }}
        />
      </div>

      {/* Tag-Chips */}
      {tags.length === 0 ? (
        <p style={{ color: "#888" }}>Keine Tags gefunden.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              onRename={() => { setRenameTarget(tag); setRenameValue(tag); }}
              onDelete={() => setDeleteTarget(tag)}
            />
          ))}
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div style={overlayStyle}>
          <div style={modalBoxStyle}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>Tag umbenennen</h2>
            <p style={{ margin: "0 0 16px", color: "#888", fontSize: 13 }}>
              Alle Produkte mit „{renameTarget}" werden aktualisiert.
            </p>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitRename()}
              placeholder="Neuer Tag-Name"
              style={inputStyle}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setRenameTarget(null)} style={btnStyle("secondary")}>Abbrechen</button>
              <button onClick={submitRename} disabled={isBusy || !renameValue.trim()} style={btnStyle("primary", isBusy)}>
                {isBusy ? "Speichern…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      <DeleteModal
        open={!!deleteTarget}
        title={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={submitDelete}
        description={`Tag „${deleteTarget}" wird von allen Produkten entfernt.`}
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

function TagChip({ tag, onRename, onDelete }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "#fff", border: "1px solid #ddd",
        borderRadius: 20, padding: "6px 12px",
        fontSize: 13, fontWeight: 500,
        transition: "border-color 0.15s",
        borderColor: hovered ? "#aaa" : "#ddd",
      }}
    >
      <HashtagIcon width={13} height={13} style={{ opacity: 0.5 }} />
      <span>{tag}</span>
      {hovered && (
        <>
          <button onClick={onRename} title="Umbenennen" style={chipBtnStyle}>
            <EditIcon width={13} height={13} />
          </button>
          <button onClick={onDelete} title="Löschen" style={{ ...chipBtnStyle, color: "#c0392b" }}>
            <DeleteIcon width={13} height={13} />
          </button>
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalBoxStyle = { background: "#fff", borderRadius: 12, padding: 24, width: 420, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" };
const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14, boxSizing: "border-box" };
const chipBtnStyle = { border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", color: "#555" };

function btnStyle(variant, disabled) {
  const base = { display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500 };
  if (variant === "primary") return { ...base, background: disabled ? "#ccc" : "#303030", color: "#fff" };
  return { ...base, background: "#f0f0f0", color: "#333" };
}
