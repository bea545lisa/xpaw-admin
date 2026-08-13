import { authenticate } from "../shopify.server";
import { readOnlyDenial } from "../utils/access.server";

// Loader hinzufügen damit die Route valide ist
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return Response.json({ ok: true });
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const _denial = readOnlyDenial(session); if (_denial) return _denial;
  const { createStagedUpload, addProductMedia } = await import("../services/product.server");

  const formData = await request.formData();
  const step = formData.get("step");
  const productId = formData.get("productId");

  if (step === "stage") {
    const stagedTarget = await createStagedUpload(
      admin,
      formData.get("filename"),
      formData.get("mimeType")
    );
    return Response.json({ stagedTarget });
  }

  if (step === "link") {
    const media = await addProductMedia(admin, productId, formData.get("resourceUrl"));
    return Response.json({ mediaId: media?.id ?? null });
  }

  return Response.json({ error: "Unbekannter Step" }, { status: 400 });
};

// Leere Komponente damit React Router die Route akzeptiert
export default function UploadRoute() {
  return null;
}
