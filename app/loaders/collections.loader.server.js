export async function collectionsLoader({ request }, admin) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";
  const query = search ? `title:*${search}*` : "";

  const response = await admin.graphql(
    `#graphql
    query GetCollections($query: String) {
      collections(first: 50, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            descriptionHtml
            productsCount { count }
            image { url altText }
            updatedAt
          }
        }
      }
    }`,
    { variables: { first: 50, query } }
  );

  const data = await response.json();
  const collections = data.data.collections.edges.map((e) => e.node);
  return { collections };
}
