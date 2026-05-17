const LIST_QUERY = `
  query($cursor: String) {
    products(first: 50, after: $cursor) {
      edges {
        cursor
        node {
          id title status handle onlineStorePreviewUrl
          createdAt updatedAt templateSuffix description tags
          featuredImage { url altText }
          collections(first: 10) {
            edges { node { id title } }
          }
          images(first: 5) {
            edges { node { id url altText } }
          }
          variants(first: 50) {
            edges {
              node {
                id title price compareAtPrice
                inventoryQuantity sku barcode
                image { id url altText }
                inventoryItem { id }
                selectedOptions { name value }
              }
            }
          }
          options {
            id name values
            optionValues { id name }
          }
          metafields(first: 5) {
            edges { node { id namespace key value } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export async function productsLoader({ request }, admin) {
  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  const shop = requestUrl.searchParams.get("shop");

  let allProducts = [];
  let cursor = null;
  let hasMore = true;
  let pageCount = 0;
  const MAX_PAGES = 20;

  while (hasMore && pageCount < MAX_PAGES) {
    pageCount++;
    const response = await admin.graphql(LIST_QUERY, { variables: { cursor } });
    const json = await response.json();
    const conn = json?.data?.products;
    if (!conn) break;
    allProducts = [...allProducts, ...conn.edges];
    hasMore = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  const locationRes = await admin.graphql(`
    query { locations(first: 1) { edges { node { id } } } }
  `);
  const locationJson = await locationRes.json();
  const locationId = locationJson?.data?.locations?.edges?.[0]?.node?.id;

  return { products: allProducts, host, shop, locationId };
}
