import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Box,
  InlineStack,
  TextField,
  Toast,
  Modal,
  SkeletonBodyText,
  SkeletonDisplayText
} from "@shopify/polaris";

import {
  useLoaderData,
  useFetcher,
  useNavigate,
  useNavigation
} from "react-router";

import { authenticate } from "../shopify.server";
import { useEffect, useState, useRef } from "react";

/* =========================
   LOADER
========================= */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const isPrevious = url.searchParams.get("direction") === "prev";

  const query = isPrevious
    ? `
      query getProducts($cursor: String) {
        products(last: 5, before: $cursor) {
          edges {
            cursor
            node {
              id
              title
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `
    : `
      query getProducts($cursor: String) {
        products(first: 5, after: $cursor) {
          edges {
            cursor
            node {
              id
              title
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;
  const response = await admin.graphql(query, {
    variables: { cursor },
  });

  const data = await response.json();

  return {
    products: data.data.products.edges,
    pageInfo: data.data.products.pageInfo,
  };
};

/* =========================
   ACTION
========================= */
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const type = form.get("action");

  if (type === "create") {
    const res = await admin.graphql(`
      mutation {
        productCreate(input: { title: "Test Produkt 🚀" }) {
          product { id title }
        }
      }
    `);
    const data = await res.json();

    return {
      ok: true,
      type: "create",
      product: data.data.productCreate.product,
    };
  }

  if (type === "delete") {
    const id = form.get("id");

    await admin.graphql(
      `mutation ($input: ProductDeleteInput!) {
        productDelete(input: $input) { deletedProductId }
      }`,
      { variables: { input: { id } } }
    );

    return { ok: true, type: "delete", id };
  }

  if (type === "update") {
    const id = form.get("id");
    const title = form.get("title");

    const res = await admin.graphql(
      `mutation ($input: ProductInput!) {
        productUpdate(input: $input) { product { id title } }
      }`,
      { variables: { input: { id, title } } }
    );

    const data = await res.json();

    return {
      ok: true,
      type: "update",
      product: data.data.productUpdate.product,
    };
  }

  return null;
};

/* =========================
   UI
========================= */
export default function Products() {
  const { products, pageInfo } = useLoaderData();

  const fetcher = useFetcher();
  const loadMoreFetcher = useFetcher();

  const navigate = useNavigate();
  const navigation = useNavigation();

  const [productList, setProductList] = useState(products);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [toast, setToast] = useState(null);

  // 🔥 EDIT MODAL
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editValue, setEditValue] = useState("");

  // 🔥 DELETE MODAL
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteTitle, setDeleteTitle] = useState("");

  const loadMoreRef = useRef(null);

  const useInfinite = productList.length < 50;
  const [disableInfinite, setDisableInfinite] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);
  const isIdle = loadMoreFetcher.state === "idle";

  // ================= SEARCH =================
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = productList.filter((p) =>
    p.node.title.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  // ================= ACTION HANDLER =================
  const handleUpdate = () => {
    fetcher.submit(
      {
        action: "update",
        id: editId,
        title: editValue,
      },
      { method: "post" }
    );
  };

  const handleDelete = () => {
    fetcher.submit(
      {
        action: "delete",
        id: deleteId,
      },
      { method: "post" }
    );
  };

  // ================= CRUD EFFECT =================
  useEffect(() => {
    if (!fetcher.data?.ok) return;

    if (fetcher.data.type === "create") {
      setToast("Produkt erstellt 🎉");
      setProductList((prev) => [{ node: fetcher.data.product }, ...prev]);
    }

    if (fetcher.data.type === "update") {
      setToast("Produkt aktualisiert ✏️");

      setProductList((prev) =>
        prev.map((p) =>
          p.node.id === fetcher.data.product.id
            ? { node: fetcher.data.product }
            : p
        )
      );

      setModalOpen(false);
      setDisableInfinite(true); // 🔥 STOP
    }

    if (fetcher.data.type === "delete") {
      setToast("Produkt gelöscht 🗑️");

      setProductList((prev) =>
        prev.filter((p) => p.node.id !== fetcher.data.id)
      );

      setDeleteModalOpen(false);
    }
  }, [fetcher.data]);

  // ================= INFINITE =================
  useEffect(() => {
    if (!useInfinite) return;

    const el = loadMoreRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];

        if (
          first.isIntersecting &&
          pageInfo.hasNextPage &&
          loadMoreFetcher.state === "idle" &&
          hasUserScrolled
        ) {
          const last = productList.at(-1);
          if (!last?.cursor) return;

          const params = new URLSearchParams(window.location.search);
          params.set("cursor", last.cursor);

          loadMoreFetcher.load(`?${params.toString()}`);
        }
      },
      {
        root: null,
        rootMargin: "300px", // 🔥 lädt früher!
        threshold: 0,
      }
    );

    observer.observe(el);

    return () => observer.disconnect();
  }, [productList, pageInfo, useInfinite, hasUserScrolled,isIdle ]);

  useEffect(() => {
    if (!disableInfinite) return;

    const t = setTimeout(() => {
      setDisableInfinite(false);
    }, 500); // 0.5s reicht

    return () => clearTimeout(t);
  }, [disableInfinite]);

  useEffect(() => {
    const handleScroll = () => {
      setHasUserScrolled(true);
    };

    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (loadMoreFetcher.data?.products) {
      setProductList((prev) => {
        const ids = new Set(prev.map((p) => p.node.id));
        const next = loadMoreFetcher.data.products.filter(
          (p) => !ids.has(p.node.id)
        );
        return [...prev, ...next];
      });
    }
  }, [loadMoreFetcher.data]);

  const handleNext = () => {
    const params = new URLSearchParams(window.location.search);
    params.set("cursor", pageInfo.endCursor);
    navigate(`?${params.toString()}`);
  };

  return (
    <>
      {/* 🔥 TOAST */}
      {toast && (
        <Toast content={toast} onDismiss={() => setToast(null)} />
      )}

      {/* 🔥 EDIT MODAL */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Produkt bearbeiten"
        primaryAction={{
          content: "Speichern",
          onAction: handleUpdate,
        }}
        secondaryActions={[
          { content: "Abbrechen", onAction: () => setModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <TextField
            label="Titel"
            value={editValue}
            onChange={setEditValue}
          />
        </Modal.Section>
      </Modal>

      {/* 🔥 DELETE MODAL */}
      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={deleteTitle}
        primaryAction={{
          content: "Löschen",
          destructive: true,
          onAction: handleDelete,
        }}
        secondaryActions={[
          { content: "Abbrechen", onAction: () => setDeleteModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text>
            Wirklich löschen: <strong>{deleteTitle}</strong>?
          </Text>
        </Modal.Section>
      </Modal>

      <Page title="Produkte">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Suche"
                  value={query}
                  onChange={setQuery}
                />

                <Button
                  onClick={() =>
                    fetcher.submit({ action: "create" }, { method: "post" })
                  }
                >
                  Produkt erstellen
                </Button>

                {/* 👉 Buttons nur wenn kein Infinite */}
                {!useInfinite && (
                  <Button onClick={handleNext}>Weiter</Button>
                )}

                <BlockStack gap="200">
                  {filtered.map((p) => (
                    <Box key={p.node.id}>
                      <InlineStack align="space-between">
                        <Text>{p.node.title}</Text>

                        <InlineStack>
                          <Button
                            onClick={() => {
                              setEditId(p.node.id);
                              setEditValue(p.node.title);
                              setModalOpen(true);
                            }}
                          >
                            Bearbeiten
                          </Button>

                          <Button
                            tone="critical"
                            onClick={() => {
                              setDeleteId(p.node.id);
                              setDeleteTitle(p.node.title);
                              setDeleteModalOpen(true);
                            }}
                          >
                            Löschen
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}

                  {/* 👉 Infinite Trigger */}
                  {useInfinite && <div ref={loadMoreRef} />}

                  {/* 👉 Loading */}
                  {loadMoreFetcher.state !== "idle" && (
                    <SkeletonBodyText lines={2} />
                  )}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}
