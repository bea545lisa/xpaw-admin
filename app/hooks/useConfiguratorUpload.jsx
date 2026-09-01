/* eslint-disable react-hooks/exhaustive-deps */
import { useFetcher } from "react-router";
import { useState, useRef, useEffect } from "react";

// Uploads a single file as a standalone Shopify File (not product media) for
// use in Konfigurator metafield values (canvas_layers masks, canvas_background,
// canvas_shading). Deliberately does NOT run the file through resizeImageFile
// (see useImageUpload.jsx/imageResize.js) - that pipeline can downscale/
// re-encode large images, which for a mask would soften the alpha-channel
// edges that destination-in compositing relies on being sharp. Uploads the
// original file bytes unchanged. Mirrors the existing uploadSwatchFile/
// uploadDarkModeImageFile action handlers in app_.products.$id.jsx (same
// stage -> client-uploads-to-S3 -> link flow), just under its own action
// name so it doesn't get tangled up with those.
export function useConfiguratorUpload({ setToast } = {}) {
  const stageFetcher = useFetcher();
  const linkFetcher = useFetcher();
  const pendingFile = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);

  const upload = (file, filename) => {
    if (!file) return;
    setError(null);
    setResultUrl(null);
    setUploading(true);
    pendingFile.current = file;
    stageFetcher.submit(
      { action: "uploadConfiguratorFile", step: "stage", filename: filename || file.name, mimeType: file.type },
      { method: "POST" }
    );
  };

  // Schritt 1 -> Schritt 2 (direkter Upload der Rohdatei an Shopifys Staging-URL)
  useEffect(() => {
    if (stageFetcher.state !== "idle" || !stageFetcher.data?.stagedTarget) return;

    const { url, parameters, resourceUrl } = stageFetcher.data.stagedTarget;
    const file = pendingFile.current;
    if (!file) return;

    const uploadForm = new FormData();
    parameters.forEach(({ name, value }) => uploadForm.append(name, value));
    uploadForm.append("file", file);

    fetch(url, { method: "POST", body: uploadForm })
      .then((res) => {
        if (!res.ok) throw new Error(`Upload fehlgeschlagen: ${res.status}`);
        linkFetcher.submit(
          { action: "uploadConfiguratorFile", step: "link", resourceUrl },
          { method: "POST" }
        );
      })
      .catch((err) => {
        setError(err.message);
        setUploading(false);
        setToast?.("Upload fehlgeschlagen ❌");
      });
  }, [stageFetcher.state, stageFetcher.data]);

  // Schritt 3 abgeschlossen
  useEffect(() => {
    if (linkFetcher.state !== "idle" || !linkFetcher.data) return;
    setUploading(false);
    if (!linkFetcher.data.ok) {
      setError(linkFetcher.data.error || "Unbekannter Fehler");
      setToast?.("Upload fehlgeschlagen ❌");
      return;
    }
    if (linkFetcher.data.fileUrl) {
      // ?v= drinlassen (wie bei den anderen Upload-Wegen/uploadSwatchFile
      // etc.) - Dateien werden in der Praxis manchmal unter demselben Namen
      // in Shopify Files ersetzt statt immer neu hochgeladen; ohne den
      // Cache-Busting-Parameter zeigt der Browser dann dauerhaft die alte,
      // gecachte Version.
      setResultUrl(linkFetcher.data.fileUrl);
      setToast?.("Bild hochgeladen ✅");
    }
  }, [linkFetcher.state, linkFetcher.data]);

  return { upload, uploading, error, resultUrl, setResultUrl };
}
