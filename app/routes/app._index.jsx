import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";

function fetchAllProductsQuery() {
  return `
    query($cursor: String) {
      products(first: 50, after: $cursor) {
        edges {
          cursor
          node {
            id
            title
            status
            createdAt
            updatedAt
            featuredImage { url altText }
            collections(first: 10) {
              edges { node { id title } }
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  price
                  compareAtPrice
                  inventoryQuantity
                }
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;
}

function collectProducts(nodes) {
  return nodes.map((edge) => edge?.node).filter(Boolean);
}

function getLowestPrice(product) {
  const prices = product.variants?.edges?.map(({ node }) => Number.parseFloat(node.price)) ?? [];
  const valid = prices.filter(Number.isFinite);
  return valid.length > 0 ? Math.min(...valid) : 0;
}

function getInventoryTotal(product) {
  return product.variants?.edges?.reduce((sum, { node }) => sum + (Number(node.inventoryQuantity) || 0), 0) ?? 0;
}

function isLowStock(product) {
  return product.variants?.edges?.some(({ node }) => {
    const quantity = Number(node.inventoryQuantity) || 0;
    return quantity > 0 && quantity <= 5;
  }) ?? false;
}

function isSaleProduct(product) {
  return product.variants?.edges?.some(({ node }) => {
    const price = Number.parseFloat(node.price);
    const compareAtPrice = Number.parseFloat(node.compareAtPrice);
    return Number.isFinite(price) && Number.isFinite(compareAtPrice) && compareAtPrice > price;
  }) ?? false;
}

function bucketPrice(price) {
  if (price < 25) return { key: "under-25", label: "0-24,99 €" };
  if (price < 50) return { key: "25-49", label: "25-49,99 €" };
  if (price < 100) return { key: "50-99", label: "50-99,99 €" };
  if (price < 200) return { key: "100-199", label: "100-199,99 €" };
  return { key: "200-plus", label: "200 €+" };
}

function createCsv(products) {
  const headers = ["Produkt ID", "Titel", "Status", "Collections", "Preis", "Lager", "Sale", "Bilder"];
  const rows = [];

  products.forEach((product) => {
    const collections = product.collections?.edges?.map((edge) => edge.node.title).join(", ") ?? "";
    const hasImage = Boolean(product.featuredImage?.url);
    const sale = isSaleProduct(product) ? "Ja" : "Nein";
    const stock = String(getInventoryTotal(product));
    const lowestPrice = getLowestPrice(product);

    rows.push([
      product.id,
      `"${String(product.title ?? "").replaceAll('"', '""')}"`,
      product.status ?? "",
      `"${collections.replaceAll('"', '""')}"`,
      `€${lowestPrice.toFixed(2)}`,
      stock,
      sale,
      hasImage ? "Ja" : "Nein",
    ].join(";"));
  });

  return [headers.join(";"), ...rows].join("\n");
}

function downloadCsv(products) {
  const csv = createCsv(products);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dashboard-export-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DashboardCard({ children, className = "", to, ariaLabel }) {
  const content = (
    <div className={`dashboard-card ${className}`.trim()}>
      {children}
    </div>
  );

  if (to) {
    return (
      <Link to={to} aria-label={ariaLabel} className="dashboard-card-link">
        {content}
      </Link>
    );
  }

  return (
    content
  );
}

function StatCard({ label, value, detail, tone = "base", to, ariaLabel }) {
  const badges = {
    base: undefined,
    critical: "critical",
    warning: "warning",
    success: "success",
    info: "info",
  };

  return (
    <DashboardCard to={to} ariaLabel={ariaLabel}>
      <Card>
        <Box padding="400">
          <BlockStack gap="100">
            <InlineStack align="space-between" blockAlign="start">
              <Text as="p" variant="bodySm" tone="subdued">{label}</Text>
              {tone !== "base" && <Badge tone={badges[tone]}>{tone === "critical" ? "Achtung" : tone === "warning" ? "Prüfen" : tone === "success" ? "Gut" : "Info"}</Badge>}
            </InlineStack>
            <Text as="p" variant="heading2xl">{value}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{detail}</Text>
          </BlockStack>
        </Box>
      </Card>
    </DashboardCard>
  );
}

function BarListCard({ title, items, emptyLabel, color = "var(--p-color-bg-fill-brand)", to, ariaLabel }) {
  const maxValue = Math.max(...items.map((item) => item.value), 1);

  return (
    <DashboardCard to={to} ariaLabel={ariaLabel}>
      <Card>
        <Box padding="400">
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingSm">{title}</Text>
              <Text as="p" variant="bodySm" tone="subdued">{items.length} Einträge</Text>
            </InlineStack>
            <Divider />
            {items.length === 0 ? (
              <Text as="p" tone="subdued">{emptyLabel}</Text>
            ) : (
              <BlockStack gap="200">
              {items.map((item) => {
                const width = `${Math.max(6, (item.value / maxValue) * 100)}%`;
                const row = (
                  <div style={{ display: "grid", gap: 6 }}>
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="p" variant="bodySm">{item.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{item.value}</Text>
                    </InlineStack>
                    <div style={{ height: 10, borderRadius: 999, background: "var(--p-color-bg-surface-secondary)", overflow: "hidden" }}>
                      <div
                        style={{
                          width,
                          height: "100%",
                          borderRadius: 999,
                          background: item.color ?? color,
                          transition: "width 160ms ease",
                        }}
                      />
                    </div>
                  </div>
                );

                return (
                  item.to ? (
                    <Link
                      key={item.label}
                      to={item.to}
                      aria-label={item.ariaLabel ?? `Produkte für ${item.label} öffnen`}
                      className="dashboard-row-link"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div key={item.label} style={{ display: "grid", gap: 6 }}>
                      {row}
                    </div>
                  )
                );
              })}
              </BlockStack>
            )}
          </BlockStack>
        </Box>
      </Card>
    </DashboardCard>
  );
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  let products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await admin.graphql(fetchAllProductsQuery(), {
      variables: { cursor },
    });

    const json = await response.json();
    const productConnection = json?.data?.products;

    products = [...products, ...collectProducts(productConnection?.edges ?? [])];
    hasNextPage = Boolean(productConnection?.pageInfo?.hasNextPage);
    cursor = productConnection?.pageInfo?.endCursor ?? null;
  }

  const normalized = products.map((product) => ({
    ...product,
    variants: product.variants ?? { edges: [] },
    collections: product.collections ?? { edges: [] },
  }));

  const summary = {
    lowStock: normalized.filter(isLowStock).length,
    noImages: normalized.filter((product) => !product.featuredImage?.url).length,
    sale: normalized.filter(isSaleProduct).length,
    drafts: normalized.filter((product) => product.status === "DRAFT").length,
  };

  const collectionCounts = new Map();
  const stockBuckets = new Map([
    ["out-of-stock", { key: "out-of-stock", label: "Ausverkauft", value: 0, color: "var(--p-color-text-critical)" }],
    ["low-stock", { key: "low-stock", label: "Niedrig", value: 0, color: "var(--p-color-text-warning)" }],
    ["healthy", { key: "healthy", label: "Ok", value: 0, color: "var(--p-color-text-success)" }],
  ]);
  const priceBuckets = new Map();

  normalized.forEach((product) => {
    product.collections?.edges?.forEach(({ node }) => {
      collectionCounts.set(node.title, (collectionCounts.get(node.title) ?? 0) + 1);
    });

    const quantities = product.variants?.edges?.map(({ node }) => Number(node.inventoryQuantity) || 0) ?? [];
    const totalStock = quantities.reduce((sum, quantity) => sum + quantity, 0);
    const anyOutOfStock = quantities.some((quantity) => quantity === 0);
    const anyLowStock = quantities.some((quantity) => quantity > 0 && quantity <= 5);

    if (anyOutOfStock) {
      stockBuckets.get("out-of-stock").value += 1;
    } else if (anyLowStock) {
      stockBuckets.get("low-stock").value += 1;
    } else if (totalStock > 0) {
      stockBuckets.get("healthy").value += 1;
    }

    const bucket = bucketPrice(getLowestPrice(product));
    priceBuckets.set(bucket.key, {
      key: bucket.key,
      label: bucket.label,
      value: (priceBuckets.get(bucket.key)?.value ?? 0) + 1,
      color: "var(--p-color-text-info)",
    });
  });

  return {
    products: normalized,
    summary,
    charts: {
      collections: Array.from(collectionCounts.entries())
        .map(([label, value]) => ({ label, value, to: `/app/products?collectionTitle=${encodeURIComponent(label)}` }))
        .sort((left, right) => right.value - left.value)
        .slice(0, 6),
      stock: Array.from(stockBuckets.values()).map((item) => ({
        ...item,
        to: `/app/products?stock=${item.key}`,
      })),
      prices: Array.from(priceBuckets.values()).map((item) => ({
        ...item,
        to: `/app/products?priceBucket=${item.key}`,
      })).sort((left, right) => {
        const order = ["0-24,99 €", "25-49,99 €", "50-99,99 €", "100-199,99 €", "200 €+"];
        return order.indexOf(left.label) - order.indexOf(right.label);
      }),
    },
  };
};

export default function Dashboard() {
  const { products, summary, charts } = useLoaderData();
  const navigate = useNavigate();
  const location = useLocation();
  const createFetcher = useFetcher();
  const [exporting, setExporting] = useState(false);
  const appSearch = location.search || "";
  const productsAction = `/app/products${appSearch}`;
  const withAppSearch = (path) => {
    if (!appSearch) return path;
    return path.includes("?") ? `${path}&${appSearch.slice(1)}` : `${path}${appSearch}`;
  };

  const chartColumns = useMemo(() => [
    {
      title: "Produkte pro Collection",
      items: charts.collections,
      emptyLabel: "Noch keine Collections vorhanden.",
      to: undefined,
    },
    {
      title: "Lagerstatus",
      items: charts.stock,
      emptyLabel: "Keine Lagerdaten verfügbar.",
      to: undefined,
    },
    {
      title: "Preisbereiche",
      items: charts.prices,
      emptyLabel: "Noch keine Preisdaten vorhanden.",
      to: undefined,
    },
  ], [charts]);

  useEffect(() => {
    if (createFetcher.state !== "idle" || !createFetcher.data?.ok || createFetcher.data.type !== "create") return;
    const productId = String(createFetcher.data.product?.id ?? "");
    const numericId = productId.split("/").pop();
    if (numericId) {
      navigate(`/app/products/${numericId}${appSearch}`);
    }
  }, [createFetcher.state, createFetcher.data, navigate, appSearch]);

  const quickExport = () => {
    setExporting(true);
    try {
      downloadCsv(products);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <style>{`
        .dashboard-card-link {
          display: block;
          text-decoration: none;
          color: inherit;
        }

        .dashboard-row-link {
          display: block;
          text-decoration: none;
          color: inherit;
          cursor: pointer;
        }

        .dashboard-card {
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .dashboard-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(0,0,0,0.08);
        }
      `}</style>
      <Page fullWidth title="Dashboard">
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" wrap>
                <BlockStack gap="100">
                  <Text as="p" tone="subdued">Heute</Text>
                  <Text as="h1" variant="heading2xl">RexPaw Overview</Text>
                </BlockStack>
                <InlineStack gap="200" wrap>
                  <Button
                    variant="primary"
                    loading={createFetcher.state !== "idle" && createFetcher.formData?.get("action") === "create"}
                    onClick={() => createFetcher.submit({ action: "create" }, { method: "post", action: productsAction })}
                  >
                    Produkt erstellen
                  </Button>
                  <Button loading={exporting} onClick={quickExport}>CSV Export</Button>
                </InlineStack>
              </InlineStack>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "16px",
                }}
              >
                  <StatCard
                  label="Produkte niedrig im Lager"
                  value={summary.lowStock}
                  detail="Produkte mit Varianten auf 1-5 Stück"
                  tone="warning"
                  to={withAppSearch("/app/products?stock=low-stock")}
                  ariaLabel="Produkte mit niedrigem Lager öffnen"
                />
                <StatCard
                  label="Produkte ohne Bilder"
                  value={summary.noImages}
                  detail="Produkte ohne featured image"
                  tone="critical"
                  to={withAppSearch("/app/products?noImages=1")}
                  ariaLabel="Produkte ohne Bilder öffnen"
                />
                <StatCard
                  label="Sale-Produkte"
                  value={summary.sale}
                  detail="Produkte mit aktivem Vergleichspreis"
                  tone="success"
                  to={withAppSearch("/app/products?sale=1")}
                  ariaLabel="Sale-Produkte öffnen"
                />
                <StatCard
                  label="Entwürfe"
                  value={summary.drafts}
                  detail="Produkte mit Status Draft"
                  tone="info"
                  to={withAppSearch("/app/products?status=DRAFT")}
                  ariaLabel="Entwürfe öffnen"
                />
              </div>
            </BlockStack>
          </Layout.Section>

          <Layout.Section>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "16px",
              }}
            >
              {chartColumns.map((chart) => (
                <BarListCard
                  key={chart.title}
                  title={chart.title}
                  items={chart.items.map((item) => ({
                    ...item,
                    to: item.to ? withAppSearch(item.to) : undefined,
                  }))}
                  emptyLabel={chart.emptyLabel}
                  to={chart.to ? withAppSearch(chart.to) : undefined}
                  ariaLabel={`Ansicht für ${chart.title} öffnen`}
                />
              ))}
            </div>
          </Layout.Section>

        </Layout>
      </BlockStack>
      </Page>
    </>
  );
}
