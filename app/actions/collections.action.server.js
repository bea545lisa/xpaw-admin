export async function collectionsAction({ request }, admin) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create") {
    const title = formData.get("title");
    const res = await admin.graphql(
      `#graphql
      mutation CreateCollection($input: CollectionInput!) {
        collectionCreate(input: $input) {
          collection { id title }
          userErrors { field message }
        }
      }`,
      { variables: { input: { title } } }
    );
    const data = await res.json();
    const errors = data.data.collectionCreate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, action: "created", title };
  }

  if (intent === "rename") {
    const id = formData.get("id");
    const title = formData.get("title");
    const res = await admin.graphql(
      `#graphql
      mutation UpdateCollection($input: CollectionInput!) {
        collectionUpdate(input: $input) {
          collection { id title }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id, title } } }
    );
    const data = await res.json();
    const errors = data.data.collectionUpdate.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, action: "renamed", title };
  }

  if (intent === "delete") {
    const id = formData.get("id");
    const res = await admin.graphql(
      `#graphql
      mutation DeleteCollection($input: CollectionDeleteInput!) {
        collectionDelete(input: $input) {
          deletedCollectionId
          userErrors { field message }
        }
      }`,
      { variables: { input: { id } } }
    );
    const data = await res.json();
    const errors = data.data.collectionDelete.userErrors;
    if (errors.length) return { error: errors[0].message };
    return { success: true, action: "deleted" };
  }

  return { error: "Unbekannte Aktion" };
}
