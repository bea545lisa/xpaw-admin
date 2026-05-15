import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const requestUrl = new URL(request.url);
  const host = requestUrl.searchParams.get("host");
  const shop = requestUrl.searchParams.get("shop");

  let allProducts = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const response = await admin.graphql(`
      query($cursor: String) {
        products(first: 50, after: $cursor) {
          edges {
            cursor
              node {
                id title status handle onlineStorePreviewUrl
                createdAt
                updatedAt
                templateSuffix
                description
                tags
              featuredImage { url altText }
              collections(first: 10) {
                edges {
                  node { id title }
                }
              }
              images(first: 10) {
                edges {
                  node {
                    id
                    url
                    altText
                  }
                }
              }
              media(first: 10) {
                edges {
                  node {
                    id
                    ... on MediaImage {
                      image {
                        id
                        url
                        altText
                      }
                    }
                  }
                }
              }
              variants(first: 50) {
                edges {
                  node {
                    id title price
                    compareAtPrice
                    inventoryQuantity sku barcode
                    image { id url altText }
                    inventoryItem { id }
                    selectedOptions { name value }
                    metafields(first: 5, namespace: "custom") {
                      edges {
                        node { key value }
                      }
                    }
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
    `, { variables: { cursor } });

    const json = await response.json();
    const page = json.data.products;
    allProducts = [...allProducts, ...page.edges];
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  const locationRes = await admin.graphql(`
    query { locations(first: 1) { edges { node { id } } } }
  `);
  const locationJson = await locationRes.json();
  const locationId = locationJson.data.locations.edges[0]?.node?.id;

  return { products: allProducts, host, shop, locationId };
};
