export async function handleGetMetafields(admin, formData, services) {
    const { getProductMetafields } = services;
    return { ok: true, type: "getMetafields", metafields: await getProductMetafields(admin, formData.get("productId")) };
  }
  
  export async function handleSaveMetafield(admin, formData) {
    const res = await admin.graphql(`
      mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value type }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
          value: formData.get("value"),
          type: formData.get("type"),
        }]
      }
    });
    const data = await res.json();
    return { ok: true, type: "saveMetafield", metafield: data.data.metafieldsSet.metafields[0] };
  }
  
  export async function handleDeleteMetafield(admin, formData) {
    await admin.graphql(`
      mutation($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          deletedMetafields { key namespace }
          userErrors { field message }
        }
      }
    `, {
      variables: {
        metafields: [{
          ownerId: formData.get("productId"),
          namespace: formData.get("namespace"),
          key: formData.get("key"),
        }]
      }
    });
    return { ok: true, type: "deleteMetafield", metafieldId: formData.get("metafieldId") };
  }