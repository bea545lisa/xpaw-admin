async function getProductsWithTag(admin, tag) {
  const res = await admin.graphql(
    `#graphql
    query GetProductsByTag($query: String!) {
      products(first: 250, query: $query) {
        edges { node { id tags } }
      }
    }`,
    { variables: { query: `tag:"${tag}"` } }
  );
  const data = await res.json();
  return data.data.products.edges.map((e) => e.node);
}

async function updateProductTags(admin, productId, tags) {
  return admin.graphql(
    `#graphql
    mutation UpdateProductTags($input: ProductInput!) {
      productUpdate(input: $input) { userErrors { message } }
    }`,
    { variables: { input: { id: productId, tags } } }
  );
}

export async function tagsAction({ request }, admin) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "rename") {
    const oldTag = formData.get("oldTag");
    const newTag = formData.get("newTag");
    const products = await getProductsWithTag(admin, oldTag);
    await Promise.all(products.map((p) =>
      updateProductTags(admin, p.id, p.tags.map((t) => (t === oldTag ? newTag : t)))
    ));
    return { success: true, action: "renamed", newTag, count: products.length };
  }

  if (intent === "delete") {
    const tag = formData.get("tag");
    const products = await getProductsWithTag(admin, tag);
    await Promise.all(products.map((p) =>
      updateProductTags(admin, p.id, p.tags.filter((t) => t !== tag))
    ));
    return { success: true, action: "deleted", count: products.length };
  }

  if (intent === "bulkDelete") {
    const tagNames = JSON.parse(formData.get("tags"));
    let total = 0;
    for (const tag of tagNames) {
      const products = await getProductsWithTag(admin, tag);
      await Promise.all(products.map((p) =>
        updateProductTags(admin, p.id, p.tags.filter((t) => t !== tag))
      ));
      total += products.length;
    }
    return { success: true, action: "bulkDeleted", count: tagNames.length, productCount: total };
  }

  if (intent === "assign") {
    const tagNames = JSON.parse(formData.get("tags"));
    const productIds = JSON.parse(formData.get("productIds"));
    // Fetch current tags for each product
    const res = await admin.graphql(
      `#graphql
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) { ... on Product { id tags } }
      }`,
      { variables: { ids: productIds } }
    );
    const data = await res.json();
    const products = data.data.nodes.filter(Boolean);
    await Promise.all(products.map((p) => {
      const newTags = [...new Set([...p.tags, ...tagNames])];
      return updateProductTags(admin, p.id, newTags);
    }));
    return { success: true, action: "assigned", tagCount: tagNames.length, productCount: products.length };
  }

  if (intent === "create") {
    const tag = formData.get("tag");
    const productIds = JSON.parse(formData.get("productIds"));
    const res = await admin.graphql(
      `#graphql
      query GetProducts($ids: [ID!]!) {
        nodes(ids: $ids) { ... on Product { id tags } }
      }`,
      { variables: { ids: productIds } }
    );
    const data = await res.json();
    const products = data.data.nodes.filter(Boolean);
    await Promise.all(products.map((p) =>
      updateProductTags(admin, p.id, [...new Set([...p.tags, tag])])
    ));
    return { success: true, action: "created", tag, productCount: products.length };
  }

  if (intent === "searchProducts") {
    const query = formData.get("query") ?? "";
    const res = await admin.graphql(
      `#graphql
      query SearchProducts($query: String) {
        products(first: 20, query: $query) {
          edges { node { id title featuredImage { url } } }
        }
      }`,
      { variables: { query: query ? `title:*${query}*` : "" } }
    );
    const data = await res.json();
    return { intent: "searchProducts", products: data.data.products.edges.map((e) => e.node) };
  }

  return { error: "Unbekannte Aktion" };
}
