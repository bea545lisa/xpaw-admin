// Holt alle Produkte mit einem bestimmten Tag (max. 250)
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

export async function tagsAction({ request }, admin) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "rename") {
    const oldTag = formData.get("oldTag");
    const newTag = formData.get("newTag");

    const products = await getProductsWithTag(admin, oldTag);
    if (!products.length) return { success: true, action: "renamed", newTag, count: 0 };

    // Alle Produkte aktualisieren
    await Promise.all(
      products.map((p) => {
        const updatedTags = p.tags.map((t) => (t === oldTag ? newTag : t));
        return admin.graphql(
          `#graphql
          mutation UpdateProductTags($input: ProductInput!) {
            productUpdate(input: $input) {
              userErrors { message }
            }
          }`,
          { variables: { input: { id: p.id, tags: updatedTags } } }
        );
      })
    );

    return { success: true, action: "renamed", newTag, count: products.length };
  }

  if (intent === "delete") {
    const tag = formData.get("tag");
    const products = await getProductsWithTag(admin, tag);

    await Promise.all(
      products.map((p) => {
        const updatedTags = p.tags.filter((t) => t !== tag);
        return admin.graphql(
          `#graphql
          mutation UpdateProductTags($input: ProductInput!) {
            productUpdate(input: $input) {
              userErrors { message }
            }
          }`,
          { variables: { input: { id: p.id, tags: updatedTags } } }
        );
      })
    );

    return { success: true, action: "deleted", count: products.length };
  }

  return { error: "Unbekannte Aktion" };
}
