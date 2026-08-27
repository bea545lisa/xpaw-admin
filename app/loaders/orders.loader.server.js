const ORDERS_QUERY = `
  query($cursor: String, $query: String) {
    orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          currencyCode
          totalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 10) {
            edges { node { title quantity } }
          }
          shippingAddress { city country }
          tags
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function ordersLoader({ request }, admin) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const financialStatus = url.searchParams.get("financialStatus") || "";
  const fulfillmentStatus = url.searchParams.get("fulfillmentStatus") || "";

  const queryParts = [];
  if (search) queryParts.push(`name:*${search}* OR email:*${search}*`);
  if (financialStatus) queryParts.push(`financial_status:${financialStatus}`);
  if (fulfillmentStatus) queryParts.push(`fulfillment_status:${fulfillmentStatus}`);

  const query = queryParts.join(" AND ") || undefined;

  let edges = [];
  try {
    const response = await admin.graphql(ORDERS_QUERY, {
      variables: { cursor: null, query },
    });
    const json = await response.json();
    if (json?.errors?.some(e => e?.message?.toLowerCase().includes("access"))) {
      return { orders: [], accessDenied: true };
    }
    edges = json?.data?.orders?.edges ?? [];
  } catch (err) {
    try {
      const graphQLErrors = err?.response?.errors ?? err?.errors?.graphQLErrors ?? err?.graphQLErrors ?? [];
      console.error("Orders loader Fehler:", String(err?.message ?? err));
      try { console.error("GraphQL Errors:", JSON.stringify(graphQLErrors)); } catch (_) {}

      const allMessages = [
        String(err?.message ?? ""),
        ...graphQLErrors.map(e => String(e?.message ?? "")),
      ].join(" ").toLowerCase();

      if (allMessages.includes("access") || allMessages.includes("denied") || allMessages.includes("unauthorized")) {
        return { orders: [], accessDenied: true };
      }

      const firstGqlMsg = graphQLErrors[0]?.message;
      return { orders: [], error: String(firstGqlMsg ?? err?.message ?? "Unbekannter Fehler") };
    } catch (_) {
      return { orders: [], error: "Fehler beim Laden der Bestellungen" };
    }
  }

  const orders = edges.map(({ node }) => ({
    ...node,
    numericId: node.id.split("/").pop(),
    totalPrice: Number.parseFloat(node.totalPriceSet?.shopMoney?.amount ?? 0),
    currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "EUR",
  }));

  return { orders };
}
