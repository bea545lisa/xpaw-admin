export async function handleSearchCollections(admin, formData) {
    const { searchCollections } = await import("../../services/product.server");
    const collections = await searchCollections(admin, formData.get("query") ?? "");
    return Response.json({ ok: true, type: "searchCollections", collections });
  }
  
  export async function handleGetProductCollections(admin, formData) {
    const { getProductCollections } = await import("../../services/product.server");
    const collections = await getProductCollections(admin, formData.get("productId"));
    return Response.json({ ok: true, type: "getProductCollections", collections });
  }
  
  export async function handleAddToCollection(admin, formData) {
    const { addProductToCollection } = await import("../../services/product.server");
    const collection = await addProductToCollection(admin, formData.get("productId"), formData.get("collectionId"));
    return Response.json({ ok: true, type: "addToCollection", collection });
  }
  
  export async function handleRemoveFromCollection(admin, formData) {
    const { removeProductFromCollection } = await import("../../services/product.server");
    await removeProductFromCollection(admin, formData.get("productId"), formData.get("collectionId"));
    return Response.json({ ok: true, type: "removeFromCollection", collectionId: formData.get("collectionId") });
  }