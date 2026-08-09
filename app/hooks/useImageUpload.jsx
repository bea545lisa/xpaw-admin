/* eslint-disable react-hooks/exhaustive-deps */
import { useFetcher } from "react-router";
import { useState, useRef, useCallback, useEffect } from "react";

export function useImageUpload({ productId, initialImages, setLocalProducts, setToast, onImageDelete }) {

  const stageFetcher = useFetcher();
  const linkFetcher = useFetcher();
  const reorderFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const fileInputRef = useRef(null);
  const pendingFile = useRef(null);
  const uploadQueue = useRef([]);
  const isProcessing = useRef(false);  // ← State-unabhängiger Flag
  const totalFiles = useRef(0);  // ← neu in useImageUpload

  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState("");
  const [localImages, setLocalImages] = useState(initialImages);
  const [pendingResourceUrl, setPendingResourceUrl] = useState(null);

  const processNextInQueue = useCallback(() => {
    if (uploadQueue.current.length === 0) {
      isProcessing.current = false;
      totalFiles.current = 0;  // ← reset
      setUploadingImage(false);
      setUploadProgress("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const next = uploadQueue.current.shift();
    pendingFile.current = next;
    const done = totalFiles.current - uploadQueue.current.length - 1;
    setUploadProgress(`${done + 1} / ${totalFiles.current}`);  // z.B. "1 / 3"

    stageFetcher.submit(
      { action: "uploadImage", step: "stage", productId, filename: next.name, mimeType: next.type },
      { method: "POST" }
    );
  }, [productId]);

  const handleImagesUpload = useCallback((files) => {

    const valid = files.filter(file => {
      if (!file.type.startsWith("image/")) {
        setUploadError("Nur Bilddateien erlaubt.");
        return false;
      }
      if (file.size > 20 * 1024 * 1024) {
        setUploadError("Maximale Dateigröße: 20 MB.");
        return false;
      }
      return true;
    });

    if (valid.length === 0) return;

    // ALLE auf einmal in Queue
    valid.forEach(f => uploadQueue.current.push(f));
    totalFiles.current = uploadQueue.current.length + (isProcessing.current ? 1 : 0);

    if (!isProcessing.current) {
      isProcessing.current = true;
      setUploadingImage(true);
      setUploadError(null);
      processNextInQueue();
    }
  }, [productId, processNextInQueue]);

  const handleImageUpload = useCallback((file) => {
    handleImagesUpload([file]);
  }, [handleImagesUpload]);

  const reorderImages = useCallback((images) => {
    const mediaIds = images
      .map(img => img.id)
      .filter(id => !String(id).startsWith("temp-"));
    if (mediaIds.length < 2) return;
    reorderFetcher.submit(
      { action: "reorderImages", productId, mediaIds: JSON.stringify(mediaIds) },
      { method: "POST" }
    );
  }, [productId]);

  const deleteImage = useCallback((img, index) => {
    setLocalImages(prev => prev.filter((_, i) => i !== index));
    onImageDelete?.(img);

    const mediaId = img.mediaId ?? img.id;

    if (mediaId && !String(mediaId).startsWith("temp-")) {
      deleteFetcher.submit(
        { action: "deleteImage", productId, mediaId },
        { method: "POST" }
      );

      setToast?.("Bild gelöscht 🗑️");

      // localProducts aktualisieren
      setLocalProducts(prev => prev.map(p =>
        p.node.id === productId
          ? {
              node: {
                ...p.node,
                featuredImage: p.node.featuredImage?.id === img.id
                  ? null
                  : p.node.featuredImage,
                media: {
                  edges: (p.node.media?.edges ?? []).filter(
                    e => e.node.id !== mediaId
                  )
                },
                images: {
                  edges: (p.node.images?.edges ?? []).filter(
                    e => e.node.id !== img.id
                  )
                },
              }
            }
          : p
      ));
    }
  }, [productId, setLocalProducts]);

  // Schritt 1 → Schritt 2 (S3)
  useEffect(() => {
    if (stageFetcher.state !== "idle" || !stageFetcher.data?.stagedTarget) return;

    const { url, parameters, resourceUrl } = stageFetcher.data.stagedTarget;
    const file = pendingFile.current;
    if (!file) return;

    const uploadForm = new FormData();
    parameters.forEach(({ name, value }) => uploadForm.append(name, value));
    uploadForm.append("file", file);

    fetch(url, { method: "POST", body: uploadForm })
      .then(res => {
        if (!res.ok) throw new Error(`S3 Upload fehlgeschlagen: ${res.status}`);
        setPendingResourceUrl(resourceUrl);
      })
      .catch(err => {
        setUploadError(err.message);
        setToast?.("Bild-Upload fehlgeschlagen ❌");
        processNextInQueue();
      });
  }, [stageFetcher.state, stageFetcher.data]);

  // Schritt 3 triggern
  useEffect(() => {
    if (!pendingResourceUrl) return;
    linkFetcher.submit(
      { action: "uploadImage", step: "link", productId, resourceUrl: pendingResourceUrl },
      { method: "POST" }
    );
    setPendingResourceUrl(null);
  }, [pendingResourceUrl]);

  // Schritt 3 abgeschlossen
  useEffect(() => {
    if (linkFetcher.state !== "idle" || !linkFetcher.data) return;

    const file = pendingFile.current;
    if (linkFetcher.data.error) {
      setUploadError(linkFetcher.data.error);
      setToast?.("Bild-Upload fehlgeschlagen ❌");
    } else {
      const newImage = {
        id: linkFetcher.data.mediaId ?? `temp-${Date.now()}`,
        mediaId: linkFetcher.data.mediaId ?? null,
        url: URL.createObjectURL(file),
        altText: file?.name ?? "",
      };
      setLocalImages(prev => [...prev, newImage]);
      setLocalProducts(prev => prev.map(p =>
        p.node.id === productId
          ? {
              node: {
                ...p.node,
                featuredImage: p.node.featuredImage ?? newImage,
                media: {
                  edges: [
                    ...(p.node.media?.edges ?? []),
                    {
                      node: {
                        id: newImage.id,
                        image: {
                          id: newImage.id,
                          url: newImage.url,
                          altText: newImage.altText,
                        }
                      }
                    }
                  ]
                }
              }
            }
          : p
      ));

      // Toast nur wenn Queue leer — also letztes Bild
      if (uploadQueue.current.length === 0) {
        const count = totalFiles.current;
        setToast?.(count > 1 ? `${count} Bilder hochgeladen ✅` : "Bild hochgeladen ✅");
      }
    }

    processNextInQueue();
  }, [linkFetcher.state, linkFetcher.data]);

  return {
    uploadingImage,
    uploadProgress,
    uploadError, setUploadError,
    localImages, setLocalImages,
    fileInputRef,
    handleImageUpload,
    handleImagesUpload,
    reorderImages,
    deleteImage,
  };
}
