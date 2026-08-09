export async function tagsLoader({ request }, admin) {
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").toLowerCase();

  const [tagsRes, productsRes] = await Promise.all([
    admin.graphql(`#graphql
      query { shop { productTags(first: 250) { edges { node } } } }
    `),
    admin.graphql(`#graphql
      query { products(first: 250) { edges { node { tags } } } }
    `),
  ]);

  const tagsData = await tagsRes.json();
  const productsData = await productsRes.json();

  const tagNames = tagsData.data.shop.productTags.edges.map((e) => e.node);
  const products = productsData.data.products.edges.map((e) => e.node);

  const tagCount = {};
  products.forEach((p) => p.tags.forEach((t) => { tagCount[t] = (tagCount[t] || 0) + 1; }));

  let tags = tagNames.map((name) => ({ name, count: tagCount[name] ?? 0 }));
  if (search) tags = tags.filter((t) => t.name.toLowerCase().includes(search));

  return { tags };
}
