import { Text, BlockStack, Spinner, Banner, Icon } from "@shopify/polaris";
import { ImageAddIcon } from "@shopify/polaris-icons";
import { useColorScheme } from "../../context/ColorSchemeContext";

export default function ImagesSection({
  localImages, setLocalImages,
  uploadingImage, uploadProgress, uploadError, setUploadError,
  fileInputRef, handleImagesUpload, reorderImages, deleteImage,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  return (
    <BlockStack gap="100">
      <div style={{ marginBottom: 0 }}>
        <Text variant="headingSm" as="h3">Bilder</Text>
      </div>

      {localImages.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {localImages.map((img, index) => (
            <div
              key={img.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("index", index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const from = parseInt(e.dataTransfer.getData("index"));
                if (from === index) return;
                setLocalImages(prev => {
                  const updated = [...prev];
                  const [moved] = updated.splice(from, 1);
                  updated.splice(index, 0, moved);
                  reorderImages(updated);
                  return updated;
                });
              }}
              style={{
                position: "relative",
                width: 80, height: 80,
                borderRadius: 8, overflow: "hidden",
                border: "1px solid var(--p-color-border)",
                cursor: "grab",
              }}
            >
              <img
                src={img.url}
                alt={img.altText ?? ""}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <button
                onClick={() => deleteImage(img, index)}
                style={{
                  position: "absolute", top: 2, right: 2,
                  background: "rgba(0,0,0,0.6)", color: "white",
                  border: "none", borderRadius: "50%",
                  width: 20, height: 20, fontSize: 11,
                  cursor: "pointer", lineHeight: "20px", textAlign: "center", padding: 0,
                }}
              >✕</button>
              {index === 0 && (
                <div style={{
                  position: "absolute", bottom: 0, left: 0, right: 0,
                  background: "rgba(0,0,0,0.5)", color: "white",
                  fontSize: 9, textAlign: "center", padding: "2px 0",
                }}>Cover</div>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleImagesUpload(Array.from(e.dataTransfer.files)); }}
        onClick={() => !uploadingImage && fileInputRef.current?.click()}
        style={{
          border: `1px solid ${isDark ? "#4a4a4a" : "var(--p-color-border)"}`,
          borderRadius: 8, padding: "20px", textAlign: "center",
          cursor: uploadingImage ? "not-allowed" : "pointer",
          background: uploadingImage
            ? "var(--p-color-bg-surface-disabled)"
            : (isDark ? "rgba(255,255,255,0.06)" : "var(--p-color-bg-surface-secondary)"),
          transition: "background 0.2s",
          minHeight: 163,  
          display: "flex",
          alignItems: "center",
          justifyContent: "center",        }}
      >
        <input
          ref={fileInputRef}
          type="file" accept="image/*" multiple
          style={{ display: "none" }}
          onChange={(e) => handleImagesUpload(Array.from(e.target.files ?? []))}
        />
        {uploadingImage ? (
          <BlockStack gap="200" inlineAlign="center">
            <Spinner size="small" />
            <Text tone="subdued">Wird hochgeladen{uploadProgress ? ` · ${uploadProgress}` : "…"}</Text>
          </BlockStack>
        ) : (
          <BlockStack gap="100" inlineAlign="center">
            <Icon source={ImageAddIcon} tone="base" />
            <Text>Bilder hier ablegen oder klicken</Text>
            <Text variant="bodySm" tone="subdued">PNG, JPG, WEBP · max. 20 MB · mehrere möglich</Text>
          </BlockStack>
        )}
      </div>

      {uploadError && (
        <Banner tone="critical" onDismiss={() => setUploadError(null)}>
          {uploadError}
        </Banner>
      )}
    </BlockStack>
  );
}