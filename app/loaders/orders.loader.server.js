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
          customer { id firstName lastName email }
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
    edges = json?.data?.orders?.edges ?? [];
  } catch (err) {
    if (err?.message?.includes("Access denied")) {
      return { orders: [], accessDenied: true };
    }
    throw err;
  }

  const orders = edges.map(({ node }) => ({
    ...node,
    numericId: node.id.split("/").pop(),
    totalPrice: Number.parseFloat(node.totalPriceSet?.shopMoney?.amount ?? 0),
    currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "EUR",
  }));

  return { orders };
}
