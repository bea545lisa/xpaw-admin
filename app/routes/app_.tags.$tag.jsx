import { useLoaderData, useNavigate, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect, useRef, useMemo } from "react";
import { HashtagIcon, ArrowLeftIcon, DeleteIcon } from "@shopify/polaris-icons";
import AppLayout from "../components/layout/AppLayout";
import { useColorScheme } from "../context/ColorSchemeContext";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const tag = decodeURIComponent(params.tag);

  const res = await admin.graphql(
    `#graphql
    query GetProductsByTag($query: String!) {
      products(first: 250, query: $query) {
        edges {
          node {
            id title status tags
            featuredImage { url altText }
            variants(first: 1) { edges { node { price } } }
          }
        }
      }
    }`,
    { variables: { query: `tag:"${tag}"` } }
  );
  const data = await res.json();
  const products = data.data.products.edges.map((e) => e.node);
  return { tag, products };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const tag = decodeURIComponent(params.tag);
  const formData = await request.formData();
  const intent = formData.get("intent");

  async function updateTags(productId, updater) {
    const res = await admin.graphql(
      `#graphql
      query GetProduct($id: ID!) { product(id: $id) { tags } }`,
      { variables: { id: productId } }
    );
    const d = await res.json();
    const newTags = updater(d.data.product.tags);
    return admin.graphql(
      `#graphql
      mutation UpdateProductTags($input: ProductInput!) {
        productUpdate(input: $input) { userErrors { message } }
      }`,
      { variables: { input: { id: productId, tags: newTags } } }
    );
  }

  if (intent === "removeFromTag") {
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map((id) => updateTags(id, (tags) => tags.filter((t) => t !== tag))));
    return { success: true, intent: "removeFromTag", removedIds: productIds };
  }

  if (intent === "addToTag") {
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map((id) => updateTags(id, (tags) => [...new Set([...tags, tag])])));
    const res = await admin.graphql(
      `#graphql
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id title status tags featuredImage { url } variants(first: 1) { edges { node { price } } } }
        }
      }`,
      { variables: { ids: productIds } }
    );
    const data = await res.json();
    return { success: true, intent: "addToTag", addedProducts: data.data.nodes.filter(Boolean) };
  }

  if (intent === "rename") {
    const newTag = formData.get("newTag");
    const res = await admin.graphql(
      `#graphql
      query GetProductsByTag($query: String!) {
        products(first: 250, query: $query) { edges { node { id tags } } }
      }`,
      { variables: { query: `tag:"${tag}"` } }
    );
    const data = await res.json();
    const products = data.data.products.edges.map((e) => e.node);
    await Promise.all(products.map((p) =>
      admin.graphql(
        `#graphql
        mutation UpdateProductTags($input: ProductInput!) {
          productUpdate(input: $input) { userErrors { message } }
        }`,
        { variables: { input: { id: p.id, tags: p.tags.map((t) => (t === tag ? newTag : t)) } } }
      )
    ));
    return { success: true, intent: "rename", newTag, count: products.length };
  }

  if (intent === "searchProducts") {
    const query = formData.get("query") ?? "";
    const res = await admin.graphql(
      `#graphql
      query SearchProducts($query: String) {
        products(first: 20, query: $query) {
          edges { node { id title status tags featuredImage { url } variants(first: 1) { edges { node { price } } } } }
        }
      }`,
      { variables: { query: query ? `title:*${query}*` : "" } }
    );
    const data = await res.json();
    return { intent: "searchProducts", products: data.data.products.edges.map((e) => e.node) };
  }

  return { error: "Unbekannte Aktion" };
};

// ── Konstanten ────────────────────────────────────────────────────────────────

const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const STATUS_COLOR = (isDark) => ({
  ACTIVE:   isDark ? "#6ee7a8" : "#16a34a",
  DRAFT:    isDark ? "#7eb8e8" : "#6b7280",
  ARCHIVED: isDark ? "#e8c97d" : "#d97706",
});
const STATUS_BG = (isDark) => ({
  ACTIVE:   isDark ? "#1a3a2a" : "#dcfce7",
  DRAFT:    isDark ? "#1e2d3d" : "#f3f4f6",
  ARCHIVED: isDark ? "#332b1a" : "#fef3c7",
});

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TagDetail() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { tag: initialTag, products: initialProducts } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();

  const removeFetcher = useFetcher();
  const addFetcher = useFetcher();
  const searchFetcher = useFetcher();
  const renameFetcher = useFetcher();

  const [tag, setTag] = useState(initialTag);
  const [products, setProducts] = useState(initialProducts);
  const [selectedIds, setSelectedIds] = useState([]);
  const [toast, setToast] = useState(null);

  // Rename
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(initialTag);

  // Add modal
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState("");
  const [modalSelected, setModalSelected] = useState([]);
  const searchTimer = useRef(null);

  // Tabellen-Sortierung
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const sortedProducts = useMemo(() => {
    if (!sortCol) return products;
    return [...products].sort((a, b) => {
      let va, vb;
      if (sortCol === "title")  { va = a.title; vb = b.title; }
      if (sortCol === "price")  { va = parseFloat(a.variants?.edges?.[0]?.node?.price ?? 0); vb = parseFloat(b.variants?.edges?.[0]?.node?.price ?? 0); }
      if (sortCol === "status") { va = a.status; vb = b.status; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [products, sortCol, sortDir]);

  const handleColSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const sortIndicator = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Remove response
  useEffect(() => {
    if (removeFetcher.state !== "idle" || !removeFetcher.data?.success) return;
    const removed = removeFetcher.data.removedIds;
    setProducts((prev) => prev.filter((p) => !removed.includes(p.id)));
    setSelectedIds([]);
    setToast(`${removed.length} Produkt${removed.length !== 1 ? "e" : ""} entfernt`);
  }, [removeFetcher.state, removeFetcher.data]);

  // Add response
  useEffect(() => {
    if (addFetcher.state !== "idle" || !addFetcher.data?.success) return;
    const added = addFetcher.data.addedProducts ?? [];
    setProducts((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      return [...prev, ...added.filter((p) => !existingIds.has(p.id))];
    });
    setModalOpen(false); setModalSearch(""); setModalSelected([]);
    setToast(`${added.length} Produkt${added.length !== 1 ? "e" : ""} hinzugefügt`);
  }, [addFetcher.state, addFetcher.data]);

  // Rename response
  useEffect(() => {
    if (renameFetcher.state !== "idle" || !renameFetcher.data?.success) return;
    const { newTag } = renameFetcher.data;
    setTag(newTag);
    setRenameOpen(false);
    setToast(`Tag umbenannt in „${newTag}"`);
    navigate(`/app/tags/${encodeURIComponent(newTag)}${location.search}`, { replace: true });
  }, [renameFetcher.state, renameFetcher.data]);

  const openModal = () => {
    setModalOpen(true); setModalSearch(""); setModalSelected([]);
    searchFetcher.submit({ intent: "searchProducts", query: "" }, { method: "post" });
  };
  const handleModalSearch = (val) => {
    setModalSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchFetcher.submit({ intent: "searchProducts", query: val }, { method: "post" });
    }, 300);
  };
  const toggleModalSelect = (id) =>
    setModalSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleAddConfirm = () => {
    if (!modalSelected.length) return;
    addFetcher.submit({ intent: "addToTag", productIds: JSON.stringify(modalSelected) }, { method: "post" });
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleAll = () =>
    setSelectedIds(selectedIds.length === products.length ? [] : products.map((p) => p.id));

  const openProduct = (productId) => {
    const numId = productId.split("/").pop();
    navigate(`/app/products/${numId}${location.search}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  const backUrl = location.state?.from ?? "/app/tags";
  const alreadyIn = new Set(products.map((p) => p.id));
  const searchResults = (searchFetcher.data?.products ?? []).filter((p) => !alreadyIn.has(p.id));
  const isSearching = searchFetcher.state !== "idle";
  const isAdding = addFetcher.state !== "idle";
  const isRemoving = removeFetcher.state !== "idle";

  return (
    <AppLayout>
      <div style={{ padding: "24px 30px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={() => navigate(backUrl)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: isDark ? "#b0b7c3" : "#555", fill: isDark ? "#b0b7c3" : "#555" }}>
            <ArrowLeftIcon width={20} height={20} />
          </button>
          <span style={{ display: "flex", fill: isDark ? "#b0b7c3" : "#555" }}>
            <HashtagIcon width={22} height={22} />
          </span>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>#{tag}</h1>
          <button onClick={() => { setRenameValue(tag); setRenameOpen(true); }}
            style={{ marginLeft: 4, padding: "4px 12px", borderRadius: 6, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, background: isDark ? "#2c2c2c" : "#f9fafb", fontSize: 13, cursor: "pointer", color: isDark ? "#e5e7eb" : "#374151" }}>
            Umbenennen
          </button>
        </div>

        {/* Produktliste */}
        <div style={cardStyle(isDark)}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 12 }}>
            <label style={{ ...labelStyle(isDark), margin: 0 }}>Produkte ({products.length})</label>
            <div style={{ flex: 1 }} />
            <button onClick={openModal} style={btnStyle("secondary", false, isDark)}>+ Produkte hinzufügen</button>
            {selectedIds.length > 0 && (
              <>
                <span style={{ fontSize: 13, color: "#6b7280" }}>{selectedIds.length} ausgewählt</span>
                <button
                  onClick={() => removeFetcher.submit({ intent: "removeFromTag", productIds: JSON.stringify(selectedIds) }, { method: "post" })}
                  disabled={isRemoving}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                  <DeleteIcon width={14} height={14} /> Tag entfernen
                </button>
              </>
            )}
          </div>

          {products.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Keine Produkte mit diesem Tag</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}` }}>
                  <th colSpan={2} style={{ ...thStyle(isDark), padding: "8px 0" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
                      <input type="checkbox" checked={selectedIds.length === products.length && products.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
                      Alle Produkte auswählen
                    </label>
                  </th>
                  <th style={{ ...thStyle(isDark), textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("price")}>
                    Preis{sortIndicator("price")}
                  </th>
                  <th style={{ ...thStyle(isDark), textAlign: "center", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("status")}>
                    Status{sortIndicator("status")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((p) => {
                  const price = p.variants?.edges?.[0]?.node?.price;
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${isDark ? "#2a2a2a" : "#f5f5f5"}`, cursor: "pointer" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = isDark ? "#252525" : "#fafafa"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                      onClick={() => openProduct(p.id)}>
                      <td style={{ padding: "10px 0", width: 20 }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: "pointer" }} />
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.featuredImage?.url
                            ? <img src={p.featuredImage.url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                            : <div style={{ width: 32, height: 32, borderRadius: 4, background: isDark ? "#333" : "#e5e7eb", flexShrink: 0 }} />}
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
                            {p.tags?.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                {p.tags.map((t) => (
                                  <span key={t} style={{
                                    fontSize: 11, padding: "1px 7px", borderRadius: 20,
                                    background: t === tag ? "#dbeafe" : (isDark ? "#2a2a2a" : "#f3f4f6"),
                                    color: t === tag ? "#1d4ed8" : (isDark ? "#e5e7eb" : "#6b7280"),
                                    fontWeight: t === tag ? 600 : 400,
                                  }}>{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 14, color: isDark ? "#b0b7c3" : "#374151" }}>
                        {price ? `€${parseFloat(price).toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: STATUS_BG(isDark)[p.status] ?? (isDark ? "#2a2a2a" : "#f3f4f6"), color: STATUS_COLOR(isDark)[p.status] ?? "#6b7280" }}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Rename Modal */}
        {renameOpen && (
          <div style={overlayStyle}>
            <div style={modalBoxStyle(isDark)}>
              <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Tag umbenennen</h2>
              <p style={{ margin: "0 0 12px", color: "#888", fontSize: 13 }}>Alle Produkte mit diesem Tag werden aktualisiert.</p>
              <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && renameFetcher.submit({ intent: "rename", newTag: renameValue.trim() }, { method: "post" })}
                placeholder="Neuer Tag-Name" style={inputStyle(isDark)} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
                <button onClick={() => setRenameOpen(false)} style={btnStyle("secondary", false, isDark)}>Abbrechen</button>
                <button
                  onClick={() => renameFetcher.submit({ intent: "rename", newTag: renameValue.trim() }, { method: "post" })}
                  disabled={renameFetcher.state !== "idle" || !renameValue.trim()}
                  style={btnStyle("primary", renameFetcher.state !== "idle" || !renameValue.trim(), isDark)}>
                  Speichern
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Modal */}
        {modalOpen && (
          <div style={overlayStyle}>
            <div style={{ background: isDark ? "#1e1e1e" : "#fff", borderRadius: 14, width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)", border: isDark ? "1px solid #333" : "none" }}>
              <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Produkte hinzufügen</div>
                <input autoFocus value={modalSearch} onChange={(e) => handleModalSearch(e.target.value)}
                  placeholder="Produkte suchen…"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${isDark ? "#4a4a4a" : "#d1d5db"}`, fontSize: 14, boxSizing: "border-box", outline: "none", background: isDark ? "#2c2c2c" : "#fff", color: isDark ? "#e5e7eb" : "#111" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {isSearching
                  ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Suche…</div>
                  : searchResults.length === 0
                    ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                        {modalSearch ? "Keine Produkte gefunden" : "Alle Produkte haben bereits diesen Tag"}
                      </div>
                    : searchResults.map((p) => {
                        const checked = modalSelected.includes(p.id);
                        const price = p.variants?.edges?.[0]?.node?.price;
                        return (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: `1px solid ${isDark ? "#2a2a2a" : "#f5f5f5"}`, cursor: "pointer", background: checked ? (isDark ? "#1e3a5f" : "#f0f9ff") : "transparent" }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleModalSelect(p.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                            {p.featuredImage?.url
                              ? <img src={p.featuredImage.url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 36, height: 36, borderRadius: 4, background: isDark ? "#333" : "#e5e7eb", flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{price ? `€${parseFloat(price).toFixed(2)}` : "—"}</span>
                                {p.tags?.map((t) => (
                                  <span key={t} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 20, background: isDark ? "#2a2a2a" : "#f3f4f6", color: isDark ? "#e5e7eb" : "#6b7280" }}>{t}</span>
                                ))}
                              </div>
                            </div>
                          </label>
                        );
                      })}
              </div>
              <div style={{ padding: "12px 20px", borderTop: `1px solid ${isDark ? "#2e2e2e" : "#f0f0f0"}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setModalOpen(false)} style={btnStyle("secondary", false, isDark)}>Abbrechen</button>
                <button onClick={handleAddConfirm} disabled={!modalSelected.length || isAdding}
                  style={btnStyle("primary", !modalSelected.length || isAdding, isDark)}>
                  {isAdding ? "Hinzufügen…" : `${modalSelected.length > 0 ? `${modalSelected.length} ` : ""}Hinzufügen`}
                </button>
              </div>
            </div>
          </div>
        )}

        {toast && (
          <div style={{ position: "fixed", bottom: 20, left: "calc(240px + (100vw - 240px) / 2)", transform: "translateX(-50%)", background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, zIndex: 9999, whiteSpace: "nowrap" }}>
            {toast}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

const cardStyle  = (d) => ({ background: d ? "#1a1a1a" : "#fff", borderRadius: 12, border: `1px solid ${d ? "#2e2e2e" : "#e3e3e3"}`, padding: "16px 18px" });
const labelStyle = (d) => ({ display: "block", fontSize: 13, fontWeight: 600, color: d ? "#e5e7eb" : "#374151", marginBottom: 8 });
const inputStyle = (d) => ({ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${d ? "#4a4a4a" : "#ddd"}`, fontSize: 14, boxSizing: "border-box", outline: "none", background: d ? "#2c2c2c" : "#fff", color: d ? "#e5e7eb" : "#111" });
const thStyle    = (d) => ({ padding: "8px 8px", textAlign: "left", fontSize: 12, fontWeight: 600, color: d ? "#9ca3af" : "#6b7280" });
const overlayStyle  = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
const modalBoxStyle = (d) => ({ background: d ? "#1e1e1e" : "#fff", borderRadius: 12, padding: 24, width: 440, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", border: d ? "1px solid #333" : "none" });

function btnStyle(variant, disabled, d) {
  const base = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none", fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 500 };
  if (variant === "primary") return { ...base, background: disabled ? (d ? "#3a3a3a" : "#ccc") : "#303030", color: disabled ? (d ? "#666" : "#fff") : "#fff" };
  return { ...base, background: d ? "#2c2c2c" : "#f0f0f0", color: d ? "#e5e7eb" : "#333", border: `1px solid ${d ? "#4a4a4a" : "#e3e3e3"}` };
}
