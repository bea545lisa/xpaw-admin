import { useLoaderData, useNavigation, useNavigate, useLocation, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { useState, useEffect, useRef, useMemo } from "react";
import { CollectionIcon, ArrowLeftIcon, ImageIcon, DeleteIcon } from "@shopify/polaris-icons";
import AppLayout from "../components/layout/AppLayout";

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Collection/${params.id}`;

  const res = await admin.graphql(
    `#graphql
    query GetCollection($id: ID!) {
      collection(id: $id) {
        id title handle descriptionHtml updatedAt
        sortOrder
        seo { title description }
        productsCount { count }
        image { url altText }
        products(first: 250) {
          edges {
            node {
              id title status
              featuredImage { url altText }
              variants(first: 1) { edges { node { price } } }
              collections(first: 10) { edges { node { id title } } }
            }
          }
        }
      }
    }`,
    { variables: { id: gid } }
  );
  const data = await res.json();
  const collection = data.data.collection;
  if (!collection) throw new Response("Nicht gefunden", { status: 404 });
  const shop = new URL(request.url).searchParams.get("shop");
  return { collection, shop };
};

// ── Action ────────────────────────────────────────────────────────────────────

export const action = async ({ request, params }) => {
  const { admin } = await authenticate.admin(request);
  const gid = `gid://shopify/Collection/${params.id}`;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "update") {
    const title = formData.get("title");
    const descriptionHtml = formData.get("descriptionHtml");
    const handle = formData.get("handle") || undefined;
    const seoTitle = formData.get("seoTitle");
    const seoDescription = formData.get("seoDescription");
    const sortOrder = formData.get("sortOrder") || undefined;
    const imageUrl = formData.get("imageUrl") || null;

    const input = { id: gid, title, descriptionHtml, seo: { title: seoTitle, description: seoDescription } };
    if (handle) input.handle = handle;
    if (sortOrder) input.sortOrder = sortOrder;
    if (imageUrl) input.image = { src: imageUrl, altText: "" };

    const res = await admin.graphql(
      `#graphql
      mutation UpdateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id title handle descriptionHtml sortOrder seo { title description } image { url altText } }
          userErrors { field message }
        }
      }`,
      { variables: { input } }
    );
    const data = await res.json();
    const errors = data.data.collectionUpdate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, intent: "update", collection: data.data.collectionUpdate.collection };
  }

  if (intent === "uploadImage") {
    const filename = formData.get("filename");
    const mimeType = formData.get("mimeType");
    const stageRes = await admin.graphql(
      `#graphql
      mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets { url resourceUrl parameters { name value } }
          userErrors { field message }
        }
      }`,
      { variables: { input: [{ filename, mimeType, httpMethod: "POST", resource: "IMAGE" }] } }
    );
    const stageData = await stageRes.json();
    const errors = stageData.data.stagedUploadsCreate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { uploadTarget: stageData.data.stagedUploadsCreate.stagedTargets[0] };
  }

  if (intent === "removeProducts") {
    const { removeProductFromCollection } = await import("../services/product.server");
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map(pid => removeProductFromCollection(admin, pid, gid)));
    return { success: true, intent: "removeProducts", removedIds: productIds };
  }

  if (intent === "searchProducts") {
    const query = formData.get("query") ?? "";
    const res = await admin.graphql(
      `#graphql
      query SearchProducts($query: String) {
        products(first: 20, query: $query) {
          edges { node { id title status featuredImage { url } variants(first: 1) { edges { node { price } } } collections(first: 5) { edges { node { id title } } } } }
        }
      }`,
      { variables: { query: query ? `title:*${query}*` : "" } }
    );
    const data = await res.json();
    return { intent: "searchProducts", products: data.data.products.edges.map(e => e.node) };
  }

  if (intent === "addProducts") {
    const { addProductToCollection } = await import("../services/product.server");
    const productIds = JSON.parse(formData.get("productIds"));
    await Promise.all(productIds.map(pid => addProductToCollection(admin, pid, gid)));
    const res = await admin.graphql(
      `#graphql
      query GetAddedProducts($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product { id title status featuredImage { url } variants(first: 1) { edges { node { price } } } }
        }
      }`,
      { variables: { ids: productIds } }
    );
    const data = await res.json();
    return { success: true, intent: "addProducts", addedProducts: data.data.nodes.filter(Boolean) };
  }

  return { error: "Unbekannte Aktion" };
};

// ── Konstanten ────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "MANUAL",       label: "Manuell" },
  { value: "BEST_SELLING", label: "Meistverkauft" },
  { value: "ALPHA_ASC",    label: "A–Z" },
  { value: "ALPHA_DESC",   label: "Z–A" },
  { value: "PRICE_ASC",    label: "Preis aufsteigend" },
  { value: "PRICE_DESC",   label: "Preis absteigend" },
  { value: "CREATED",      label: "Älteste zuerst" },
  { value: "CREATED_DESC", label: "Neueste zuerst" },
];

const STATUS_LABEL = { ACTIVE: "Aktiv", DRAFT: "Entwurf", ARCHIVED: "Archiviert" };
const STATUS_COLOR = { ACTIVE: "#16a34a", DRAFT: "#6b7280", ARCHIVED: "#d97706" };
const STATUS_BG    = { ACTIVE: "#dcfce7", DRAFT: "#f3f4f6", ARCHIVED: "#fef3c7" };

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CollectionDetail() {
  const { collection, shop } = useLoaderData();
  const collectionGid = collection.id;
  const navigate = useNavigate();
  const location = useLocation();
  const saveFetcher  = useFetcher();
  const stageFetcher = useFetcher();
  const removeFetcher = useFetcher();
  const searchFetcher = useFetcher();
  const addFetcher   = useFetcher();

  const isSaving = saveFetcher.state !== "idle";

  // Felder
  const [title, setTitle]               = useState(collection.title);
  const [descriptionHtml, setDesc]      = useState(collection.descriptionHtml ?? "");
  const [handle, setHandle]             = useState(collection.handle ?? "");
  const [seoTitle, setSeoTitle]         = useState(collection.seo?.title ?? "");
  const [seoDesc, setSeoDesc]           = useState(collection.seo?.description ?? "");
  const [sortOrder, setSortOrder]       = useState(collection.sortOrder ?? "MANUAL");

  // Saved-Baseline für isDirty
  const [saved, setSaved] = useState({ title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder });
  const isDirty = title !== saved.title || descriptionHtml !== saved.descriptionHtml ||
    handle !== saved.handle || seoTitle !== saved.seoTitle ||
    seoDesc !== saved.seoDesc || sortOrder !== saved.sortOrder;

  const [imageUrl, setImageUrl]         = useState(collection.image?.url ?? null);
  const [toast, setToast]               = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);
  const pendingFile  = useRef(null);

  // Produktliste
  const initialProducts = collection.products?.edges?.map(e => e.node) ?? [];
  const [products, setProducts]   = useState(initialProducts);
  const totalCount  = collection.productsCount?.count ?? 0;
  const isTruncated = totalCount > initialProducts.length;
  const [selectedIds, setSelectedIds] = useState([]);

  // Tabellen-Sortierung
  const [sortCol, setSortCol]   = useState(null); // "title" | "price" | "status"
  const [sortDir, setSortDir]   = useState("asc");

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
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };
  const sortIndicator = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // Modal
  const [modalOpen, setModalOpen]       = useState(false);
  const [modalSearch, setModalSearch]   = useState("");
  const [modalSelected, setModalSelected] = useState([]);
  const searchTimer = useRef(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Save-Response
  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    const d = saveFetcher.data;
    if (d.success && d.intent === "update") {
      setToast("Gespeichert");
      if (d.collection?.image?.url) setImageUrl(d.collection.image.url);
      if (d.collection?.handle) setHandle(d.collection.handle);
      setSaved({ title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder });
    } else if (d.error) {
      setToast(`Fehler: ${d.error}`);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  // Stage → S3
  useEffect(() => {
    if (stageFetcher.state !== "idle" || !stageFetcher.data?.uploadTarget) return;
    const { url, resourceUrl, parameters } = stageFetcher.data.uploadTarget;
    const file = pendingFile.current;
    if (!file) return;
    const fd = new FormData();
    parameters.forEach(({ name, value }) => fd.append(name, value));
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = ev => { if (ev.lengthComputable) setUploadProgress(Math.round(ev.loaded / ev.total * 100)); };
    xhr.onload = () => {
      setUploadProgress(null); pendingFile.current = null;
      if (xhr.status < 300) {
        saveFetcher.submit({ intent: "update", title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder, imageUrl: resourceUrl }, { method: "post" });
        setToast("Bild hochgeladen");
      } else setToast(`Upload fehlgeschlagen (${xhr.status})`);
    };
    xhr.onerror = () => { setUploadProgress(null); setToast("Upload fehlgeschlagen"); };
    xhr.open("POST", url); xhr.send(fd);
  }, [stageFetcher.state, stageFetcher.data]);

  // Remove-Response
  useEffect(() => {
    if (removeFetcher.state !== "idle" || !removeFetcher.data?.success) return;
    const removed = removeFetcher.data.removedIds;
    setProducts(prev => prev.filter(p => !removed.includes(p.id)));
    setSelectedIds([]);
    setToast(`${removed.length} Produkt${removed.length > 1 ? "e" : ""} entfernt`);
  }, [removeFetcher.state, removeFetcher.data]);

  // Add-Response
  useEffect(() => {
    if (addFetcher.state !== "idle" || !addFetcher.data?.success) return;
    const added = addFetcher.data.addedProducts ?? [];
    setProducts(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      return [...prev, ...added.filter(p => !existingIds.has(p.id))];
    });
    setModalOpen(false); setModalSearch(""); setModalSelected([]);
    setToast(`${added.length} Produkt${added.length !== 1 ? "e" : ""} hinzugefügt`);
  }, [addFetcher.state, addFetcher.data]);

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
  const toggleModalSelect = (id) => setModalSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const handleAddConfirm = () => {
    if (!modalSelected.length) return;
    addFetcher.submit({ intent: "addProducts", productIds: JSON.stringify(modalSelected) }, { method: "post" });
  };

  const backUrl  = location.state?.from ?? "/app/collections";
  const handleSave = () => saveFetcher.submit({ intent: "update", title, descriptionHtml, handle, seoTitle, seoDesc, sortOrder }, { method: "post" });
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFile.current = file; setUploadProgress(0);
    stageFetcher.submit({ intent: "uploadImage", filename: file.name, mimeType: file.type }, { method: "post" });
  };

  const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleAll = () => setSelectedIds(selectedIds.length === products.length ? [] : products.map(p => p.id));

  const openProduct = (productId) => {
    const numId = productId.split("/").pop();
    navigate(`/app/products/${numId}${location.search}`, {
      state: { from: `${location.pathname}${location.search}` },
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
    <div style={{ padding: "20px 32px", minHeight: "100vh", background: "#f6f6f7" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <button onClick={() => navigate(backUrl)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", color: "#555" }}>
          <ArrowLeftIcon width={20} height={20} />
        </button>
        <CollectionIcon width={22} height={22} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{collection.title}</h1>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={isSaving || !isDirty} style={{
          padding: "8px 20px", borderRadius: 8, border: "none",
          background: isSaving || !isDirty ? "#ccc" : "#303030", color: "#fff",
          fontSize: 14, fontWeight: 500, cursor: isSaving || !isDirty ? "not-allowed" : "pointer",
        }}>
          {isSaving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "stretch", marginBottom: 24 }}>
        {/* Linke Spalte — Bild, Sortierung, Infos */}
        <div style={{ width: "33%", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...cardStyle, flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={labelStyle}>Bild</label>
            {imageUrl ? (
              <div style={{ position: "relative", borderRadius: 8, overflow: "hidden", marginBottom: 10, flex: 1, minHeight: 120, maxHeight: 400 }}>
                <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", display: "block", borderRadius: 8, objectFit: "cover" }} />
                {uploadProgress !== null && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ color: "#fff", fontWeight: 600 }}>{uploadProgress}%</div>
                  </div>
                )}
              </div>
            ) : (
              <div onClick={() => fileInputRef.current?.click()} style={{
                flex: 1, minHeight: 120, borderRadius: 8, border: "2px dashed #d1d5db",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#9ca3af", gap: 8, marginBottom: 10,
              }}>
                {uploadProgress !== null
                  ? <div style={{ fontWeight: 600, color: "#303030" }}>{uploadProgress}%</div>
                  : <><ImageIcon width={28} height={28} /><span style={{ fontSize: 13 }}>Bild hochladen</span></>}
              </div>
            )}
            <button type="button" onClick={() => fileInputRef.current?.click()} style={{
              width: "100%", padding: "7px 0", borderRadius: 7, border: "1px solid #d1d5db",
              background: "#f9fafb", fontSize: 13, cursor: "pointer", color: "#374151",
            }}>
              {imageUrl ? "Bild ändern" : "Bild auswählen"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
          </div>

          <div style={cardStyle}>
            <label style={labelStyle}>Sortierung der Produkte</label>
            <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div style={{ ...cardStyle, fontSize: 13, color: "#6b7280" }}>
            <div><strong>Geändert:</strong> {new Date(collection.updatedAt).toLocaleDateString("de-DE")}</div>
          </div>
        </div>

        {/* Rechte Spalte — Titel, Beschreibung, SEO */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={cardStyle}>
            <label style={labelStyle}>Titel</label>
            <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
          </div>

          <div style={cardStyle}>
            <label style={labelStyle}>Beschreibung</label>
            <textarea value={descriptionHtml} onChange={e => setDesc(e.target.value)} rows={5}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Beschreibung der Kollektion…" />
          </div>

          {/* SEO */}
          <div style={cardStyle}>
            <label style={{ ...labelStyle, marginBottom: 14 }}>SEO</label>
            <label style={subLabelStyle}>URL-Handle</label>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#9ca3af", whiteSpace: "nowrap" }}>/collections/</span>
              <input value={handle} onChange={e => setHandle(e.target.value)} style={{ ...inputStyle, marginBottom: 0 }} />
            </div>
            <label style={subLabelStyle}>Meta-Titel</label>
            <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 14 }} placeholder={title} />
            <label style={subLabelStyle}>Meta-Beschreibung</label>
            <textarea value={seoDesc} onChange={e => setSeoDesc(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Beschreibung für Suchmaschinen…" />
            {(seoTitle || seoDesc) && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Vorschau Suchergebnis</div>
                <div style={{ fontSize: 14, color: "#1a0dab", fontWeight: 500 }}>{seoTitle || title}</div>
                <div style={{ fontSize: 13, color: "#4d5156", marginTop: 2, lineHeight: 1.4 }}>{seoDesc || descriptionHtml.replace(/<[^>]+>/g, "")}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Produktliste */}
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14, gap: 12 }}>
          <label style={{ ...labelStyle, margin: 0 }}>Produkte ({products.length})</label>
          <div style={{ flex: 1 }} />
          <button onClick={openModal} style={{
            padding: "5px 14px", borderRadius: 7, border: "1px solid #d1d5db",
            background: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500, color: "#374151",
          }}>+ Produkte hinzufügen</button>
          {selectedIds.length > 0 && (
            <>
              <span style={{ fontSize: 13, color: "#6b7280" }}>{selectedIds.length} ausgewählt</span>
              <button onClick={() => removeFetcher.submit({ intent: "removeProducts", productIds: JSON.stringify(selectedIds) }, { method: "post" })}
                disabled={removeFetcher.state !== "idle"}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 7, border: "1px solid #fca5a5", background: "#fef2f2", color: "#dc2626", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                <DeleteIcon width={14} height={14} /> Aus Kollektion entfernen
              </button>
            </>
          )}
        </div>

        {products.length === 0 ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Keine Produkte in dieser Kollektion</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #f0f0f0" }}>
                <th colSpan={2} style={{ ...thStyle, padding: "8px 0" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontWeight: 600 }}>
                    <input type="checkbox" checked={selectedIds.length === products.length && products.length > 0} onChange={toggleAll} style={{ cursor: "pointer" }} />
                    Alle Produkte auswählen
                  </label>
                </th>
                <th style={{ ...thStyle, textAlign: "right", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("price")}>
                  Preis{sortIndicator("price")}
                </th>
                <th style={{ ...thStyle, textAlign: "center", cursor: "pointer", userSelect: "none" }} onClick={() => handleColSort("status")}>
                  Status{sortIndicator("status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts.map(p => {
                const price = p.variants?.edges?.[0]?.node?.price;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => openProduct(p.id)}
                  >
                    <td style={{ padding: "10px 0", width: 20 }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: "pointer" }} />
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {p.featuredImage?.url
                          ? <img src={p.featuredImage.url} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 4, background: "#e5e7eb", flexShrink: 0 }} />}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{p.title}</div>
                          {p.collections?.edges?.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {p.collections.edges.map(({ node: c }) => (
                                <span key={c.id} style={{
                                  fontSize: 11, padding: "1px 7px", borderRadius: 20,
                                  background: c.id === collectionGid ? "#dbeafe" : "#f3f4f6",
                                  color: c.id === collectionGid ? "#1d4ed8" : "#6b7280",
                                  fontWeight: c.id === collectionGid ? 600 : 400,
                                }}>{c.title}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontSize: 14, color: "#374151" }}>
                      {price ? `€${parseFloat(price).toFixed(2)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: STATUS_BG[p.status] ?? "#f3f4f6", color: STATUS_COLOR[p.status] ?? "#6b7280" }}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {isTruncated && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#9ca3af", textAlign: "center" }}>
            Nur die ersten 250 von {totalCount} Produkten werden angezeigt.
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (() => {
        const alreadyIn = new Set(products.map(p => p.id));
        const results = (searchFetcher.data?.products ?? []).filter(p => !alreadyIn.has(p.id));
        const isSearching = searchFetcher.state !== "idle";
        const isAdding = addFetcher.state !== "idle";
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
            <div style={{ background: "#fff", borderRadius: 14, width: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
              <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #f0f0f0" }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Produkte hinzufügen</div>
                <input autoFocus value={modalSearch} onChange={e => handleModalSearch(e.target.value)}
                  placeholder="Produkte suchen…"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {isSearching
                  ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Suche…</div>
                  : results.length === 0
                    ? <div style={{ padding: 24, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                        {modalSearch ? "Keine Produkte gefunden" : "Alle Produkte bereits in dieser Kollektion"}
                      </div>
                    : results.map(p => {
                        const checked = modalSelected.includes(p.id);
                        const price = p.variants?.edges?.[0]?.node?.price;
                        return (
                          <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid #f5f5f5", cursor: "pointer", background: checked ? "#f0f9ff" : "transparent" }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleModalSelect(p.id)} style={{ cursor: "pointer", flexShrink: 0 }} />
                            {p.featuredImage?.url
                              ? <img src={p.featuredImage.url} alt="" style={{ width: 36, height: 36, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                              : <div style={{ width: 36, height: 36, borderRadius: 4, background: "#e5e7eb", flexShrink: 0 }} />}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                                <span style={{ fontSize: 12, color: "#9ca3af" }}>{price ? `€${parseFloat(price).toFixed(2)}` : "—"}</span>
                                {p.collections?.edges?.map(({ node: c }) => (
                                  <span key={c.id} style={{ fontSize: 11, padding: "1px 6px", borderRadius: 20, background: "#f3f4f6", color: "#6b7280" }}>{c.title}</span>
                                ))}
                              </div>
                            </div>
                          </label>
                        );
                      })}
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid #f0f0f0", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setModalOpen(false)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", fontSize: 14, cursor: "pointer" }}>Abbrechen</button>
                <button onClick={handleAddConfirm} disabled={!modalSelected.length || isAdding} style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: !modalSelected.length || isAdding ? "#ccc" : "#303030",
                  color: "#fff", fontSize: 14, fontWeight: 500,
                  cursor: !modalSelected.length || isAdding ? "not-allowed" : "pointer",
                }}>
                  {isAdding ? "Hinzufügen…" : `${modalSelected.length > 0 ? `${modalSelected.length} ` : ""}Hinzufügen`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "calc(240px + (100vw - 240px) / 2)", transform: "translateX(-50%)", background: "#303030", color: "white", padding: "12px 16px", borderRadius: 8, zIndex: 9999, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}
    </div>
    </AppLayout>
  );
}

const cardStyle    = { background: "#fff", borderRadius: 12, border: "1px solid #e3e3e3", padding: "16px 18px" };
const labelStyle   = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 };
const subLabelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#6b7280", marginBottom: 6 };
const inputStyle   = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit", marginBottom: 0 };
const thStyle      = { padding: "8px 8px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" };
