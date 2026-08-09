import { useEffect, useMemo, useState } from "react";
import { Link, useFetcher, useLoaderData, useLocation, useNavigate } from "react-router";
import { HomeIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { useColorScheme } from "../context/ColorSchemeContext";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  InlineStack,
  Layout,
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

const RECENT_ORDERS_QUERY = `
  query {
    orders(first: 50, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 5) {
            edges { node { title quantity } }
          }
          customer { firstName lastName email }
        }
      }
    }
  }
`;

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Produkte + Bestellungen parallel laden
  const [productsData, ordersData] = await Promise.all([
    (async () => {
      try {
        let products = [];
        let cursor = null;
        let hasNextPage = true;
        let pageCount = 0;
        const MAX_PAGES = 20;
        while (hasNextPage && pageCount < MAX_PAGES) {
          pageCount++;
          const response = await admin.graphql(fetchAllProductsQuery(), { variables: { cursor } });
          const json = await response.json();
          const conn = json?.data?.products;
          if (!conn) break;
          products = [...products, ...collectProducts(conn?.edges ?? [])];
          hasNextPage = Boolean(conn?.pageInfo?.hasNextPage);
          cursor = conn?.pageInfo?.endCursor ?? null;
        }
        return products;
      } catch {
        return [];
      }
    })(),
    (async () => {
      try {
        const response = await admin.graphql(RECENT_ORDERS_QUERY);
        const json = await response.json();
        return json?.data?.orders?.edges?.map(({ node }) => node) ?? [];
      } catch {
        return [];
      }
    })(),
  ]);

  const normalized = productsData.map((product) => ({
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

  // Bestellungs-Metriken
  const currency = ordersData[0]?.totalPriceSet?.shopMoney?.currencyCode ?? "EUR";
  const totalRevenue = ordersData.reduce((sum, o) => sum + Number.parseFloat(o.totalPriceSet?.shopMoney?.amount ?? 0), 0);
  const openOrders = ordersData.filter((o) => o.displayFulfillmentStatus === "UNFULFILLED" || o.displayFulfillmentStatus === "PARTIAL").length;
  const unpaidOrders = ordersData.filter((o) => o.displayFinancialStatus === "PENDING" || o.displayFinancialStatus === "AUTHORIZED").length;

  // Umsatz letzte 30 Tage — tageweise gruppieren
  const now = new Date();
  const revenueByDay = new Map();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    revenueByDay.set(key, 0);
  }
  ordersData.forEach((o) => {
    const day = o.createdAt?.slice(0, 10);
    if (day && revenueByDay.has(day)) {
      revenueByDay.set(day, revenueByDay.get(day) + Number.parseFloat(o.totalPriceSet?.shopMoney?.amount ?? 0));
    }
  });
  const revenueChart = Array.from(revenueByDay.entries()).map(([date, value]) => ({
    label: new Date(date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
    value: Math.round(value * 100) / 100,
  }));

  // Top 5 Produkte nach Bestellhäufigkeit
  const productCount = new Map();
  ordersData.forEach((o) => {
    o.lineItems?.edges?.forEach(({ node }) => {
      productCount.set(node.title, (productCount.get(node.title) ?? 0) + node.quantity);
    });
  });
  const topProducts = Array.from(productCount.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Letzte 5 Bestellungen für die Tabelle
  const recentOrders = ordersData.slice(0, 5).map((o) => ({
    id: o.id,
    numericId: o.id.split("/").pop(),
    name: o.name,
    createdAt: o.createdAt,
    financialStatus: o.displayFinancialStatus,
    fulfillmentStatus: o.displayFulfillmentStatus,
    total: Number.parseFloat(o.totalPriceSet?.shopMoney?.amount ?? 0),
    currency: o.totalPriceSet?.shopMoney?.currencyCode ?? currency,
    customerName: o.customer
      ? `${o.customer.firstName ?? ""} ${o.customer.lastName ?? ""}`.trim() || o.customer.email
      : "Gast",
  }));

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
    orders: {
      total: ordersData.length,
      totalRevenue,
      currency,
      openOrders,
      unpaidOrders,
      revenueChart,
      topProducts,
      recentOrders,
    },
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

// ── Sparkline (SVG, keine externen Deps) ──────────────────────────────

function Sparkline({ data, color = "var(--p-color-bg-fill-brand)", height = 48 }) {
  if (!data || data.length < 2) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 280;
  const h = height;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: h, display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const FINANCIAL_BADGE = {
  PAID: { tone: "success", label: "Bezahlt" },
  PENDING: { tone: "warning", label: "Ausstehend" },
  REFUNDED: { tone: "info", label: "Erstattet" },
  PARTIALLY_REFUNDED: { tone: "info", label: "Teilerstattung" },
  VOIDED: { tone: "critical", label: "Storniert" },
  AUTHORIZED: { tone: "attention", label: "Autorisiert" },
  PARTIALLY_PAID: { tone: "warning", label: "Teilzahlung" },
};

const FULFILLMENT_BADGE = {
  FULFILLED: { tone: "success", label: "Versendet" },
  UNFULFILLED: { tone: "warning", label: "Offen" },
  PARTIAL: { tone: "attention", label: "Teilweise" },
};

export default function Dashboard() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const { products, summary, orders, charts } = useLoaderData();
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
      <div style={{ padding: "20px 32px", minHeight: "100vh", background: isDark ? "#212121" : "#f6f6f7" }}>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <BlockStack gap="400">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "flex", fill: isDark ? "#f3f4f6" : "#555" }}><HomeIcon width={22} height={22} /></span>
                  <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h1>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    variant="primary"
                    loading={createFetcher.state !== "idle" && createFetcher.formData?.get("action") === "create"}
                    onClick={() => createFetcher.submit({ action: "create" }, { method: "post", action: productsAction })}
                  >
                    Produkt erstellen
                  </Button>
                  <Button loading={exporting} onClick={quickExport}>CSV Export</Button>
                </div>
              </div>

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

          {/* Bestellungs-KPIs */}
          <Layout.Section>
            <BlockStack gap="300">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Text as="h2" variant="headingMd">Bestellungen (letzte 50)</Text>
                <Link to="/app/orders" style={{ fontSize: 13, color: "var(--p-color-text-interactive)", textDecoration: "none" }}>
                  Alle anzeigen →
                </Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
                <StatCard
                  label="Gesamtumsatz"
                  value={new Intl.NumberFormat("de-DE", { style: "currency", currency: orders.currency }).format(orders.totalRevenue)}
                  detail={`${orders.total} Bestellungen`}
                  tone="success"
                  to="/app/orders"
                  ariaLabel="Bestellungen öffnen"
                />
                <StatCard
                  label="Offene Bestellungen"
                  value={orders.openOrders}
                  detail="Noch nicht versendet"
                  tone={orders.openOrders > 0 ? "warning" : "base"}
                  to="/app/orders?fulfillmentStatus=unfulfilled"
                  ariaLabel="Offene Bestellungen öffnen"
                />
                <StatCard
                  label="Unbezahlt / Ausstehend"
                  value={orders.unpaidOrders}
                  detail="Zahlung ausständig"
                  tone={orders.unpaidOrders > 0 ? "critical" : "base"}
                  to="/app/orders?financialStatus=pending"
                  ariaLabel="Unbezahlte Bestellungen öffnen"
                />
              </div>

              {/* Umsatz-Sparkline */}
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Umsatz letzte 30 Tage</Text>
                    <Sparkline data={orders.revenueChart} color="var(--p-color-bg-fill-brand)" height={56} />
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <Text as="p" variant="bodySm" tone="subdued">{orders.revenueChart[0]?.label}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">{orders.revenueChart[orders.revenueChart.length - 1]?.label}</Text>
                    </div>
                  </BlockStack>
                </Box>
              </Card>
            </BlockStack>
          </Layout.Section>

          {/* Letzte Bestellungen + Top-Produkte */}
          <Layout.Section>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

              {/* Letzte Bestellungen */}
              <Card padding="0">
                <Box padding="400" paddingBlockEnd="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingSm">Letzte Bestellungen</Text>
                    <Link to="/app/orders" style={{ fontSize: 13, color: "var(--p-color-text-interactive)", textDecoration: "none" }}>Alle →</Link>
                  </InlineStack>
                </Box>
                <Divider />
                {orders.recentOrders.length === 0 ? (
                  <Box padding="400"><Text as="p" tone="subdued">Keine Bestellungen vorhanden.</Text></Box>
                ) : (
                  <div>
                    {orders.recentOrders.map((order, idx) => {
                      const fin = FINANCIAL_BADGE[order.financialStatus] ?? { tone: "new", label: order.financialStatus };
                      const ful = FULFILLMENT_BADGE[order.fulfillmentStatus] ?? { tone: "new", label: order.fulfillmentStatus };
                      return (
                        <Link
                          key={order.id}
                          to={`/app/orders/${order.numericId}`}
                          style={{ display: "block", textDecoration: "none", color: "inherit" }}
                        >
                          <div
                            style={{
                              padding: "12px 16px",
                              borderBottom: idx < orders.recentOrders.length - 1 ? "1px solid #f3f4f6" : "none",
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = "#f9fafb"}
                            onMouseLeave={(e) => e.currentTarget.style.background = ""}
                          >
                            <div style={{ flex: 1 }}>
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="span" variant="bodySm" fontWeight="semibold">{order.name}</Text>
                                <Badge tone={fin.tone}>{fin.label}</Badge>
                                <Badge tone={ful.tone}>{ful.label}</Badge>
                              </InlineStack>
                              <Text as="p" variant="bodySm" tone="subdued">{order.customerName}</Text>
                            </div>
                            <Text as="span" variant="bodySm" fontWeight="semibold">
                              {new Intl.NumberFormat("de-DE", { style: "currency", currency: order.currency }).format(order.total)}
                            </Text>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* Top-Produkte */}
              <BarListCard
                title="Top-Produkte (nach Bestellmenge)"
                items={orders.topProducts}
                emptyLabel="Noch keine Bestellungen vorhanden."
              />
            </div>
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
      </div>
    </>
  );
}
