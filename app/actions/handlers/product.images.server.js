export async function handleUploadImage(admin, formData) {
    const { createStagedUpload, addProductMedia } = await import("../../services/product.server");
    const step = formData.get("step");
    const productId = formData.get("productId");
  
    if (step === "stage") {
      const stagedTarget = await createStagedUpload(admin, formData.get("filename"), formData.get("mimeType"));
      return Response.json({ stagedTarget });
    }
  
    if (step === "link") {
      const media = await addProductMedia(admin, productId, formData.get("resourceUrl"));
      return Response.json({ mediaId: media?.id ?? null });
    }
  
    return Response.json({ error: "Unbekannter Step" }, { status: 400 });
  }
  
  export async function handleReorderImages(admin, formData) {
    const { reorderProductMedia } = await import("../../services/product.server");
    const productId = formData.get("productId");
    const mediaIds = JSON.parse(formData.get("mediaIds"));
    await reorderProductMedia(admin, productId, mediaIds);
    return Response.json({ ok: true, type: "reorderImages" });
  }
  
  export async function handleDeleteImage(admin, formData) {
    const { deleteProductMedia } = await import("../../services/product.server");
    const productId = formData.get("productId");
    const mediaId = formData.get("mediaId");
    await deleteProductMedia(admin, productId, [mediaId]);
    return Response.json({ ok: true, type: "deleteImage", mediaId });
  }