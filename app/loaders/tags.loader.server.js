export async function tagsLoader({ request }, admin) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").toLowerCase();

  const response = await admin.graphql(`
    query GetProductTags {
      shop {
        productTags(first: 250) {
          edges { node }
        }
      }
    }
  `);

  const data = await response.json();
  let tags = data.data.shop.productTags.edges.map((e) => e.node);

  if (search) tags = tags.filter((t) => t.toLowerCase().includes(search));

  return { tags };
}
