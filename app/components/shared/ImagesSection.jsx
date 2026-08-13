import { Text, BlockStack, Spinner, Banner, Icon } from "@shopify/polaris";
import { ImageAddIcon } from "@shopify/polaris-icons";
import { useColorScheme } from "../../context/ColorSchemeContext";

// Drag&Drop-Payload für beide Kachel-Typen (Light-Bild vs. zugewiesenes Dark-Bild) im selben
// Feld kodieren, damit ein einziger onDrop-Handler pro Light-Kachel beides unterscheiden kann.
function setDragPayload(e, type, index) {
  e.dataTransfer.setData("text/plain", JSON.stringify({ type, index }));
}
function getDragPayload(e) {
  try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; }
}

export default function ImagesSection({
  localImages, setLocalImages,
  uploadingImage, uploadProgress, uploadError, setUploadError,
  fileInputRef, handleImagesUpload, reorderImages, deleteImage,
  darkImages, assignDarkImage, uploadDarkImage, moveDarkImage, moveDarkToLight,
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const handleLightDrop = (e, targetIndex) => {
    e.preventDefault();
    const payload = getDragPayload(e);
    if (!payload) return;
    if (payload.type === "light") {
      if (payload.index === targetIndex) return;
      setLocalImages(prev => {
        const updated = [...prev];
        const [moved] = updated.splice(payload.index, 1);
        updated.splice(targetIndex, 0, moved);
        reorderImages(updated);
        return updated;
      });
      moveDarkImage?.(payload.index, targetIndex);
    } else if (payload.type === "dark") {
      // Ein Dark-Bild wurde auf ein (anderes) Light-Bild gezogen → dort neu zuordnen,
      // ersetzt automatisch das Light-Bild links davon als neuen Partner.
      moveDarkToLight?.(payload.index, targetIndex);
    }
  };

  return (
    <BlockStack gap="100">
      <div style={{ marginBottom: 0 }}>
        <Text variant="headingSm" as="h3">Bilder</Text>
      </div>

      {localImages.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {localImages.map((img, index) => (
            <div key={img.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {/* Light-Bild */}
              <div
                draggable
                onDragStart={(e) => setDragPayload(e, "light", index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleLightDrop(e, index)}
                style={{
                  position: "relative",
                  width: 80, height: 80,
                  borderRadius: 8, overflow: "visible",
                  cursor: "grab",
                }}
              >
                <div style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden", border: "1px solid var(--p-color-border)" }}>
                  <img
                    src={img.url}
                    alt={img.altText ?? ""}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
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

              {/* Dark-Bild (direkt rechts vom zugehörigen Light-Bild) oder leerer Platzhalter-Slot.
                  Umsortieren per Drag&Drop: ein Dark-Bild auf ein anderes Light-Bild ziehen
                  ordnet es dort automatisch neu zu. */}
              {assignDarkImage && (
                darkImages?.[index] ? (
                  <div
                    draggable
                    onDragStart={(e) => setDragPayload(e, "dark", index)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleLightDrop(e, index)}
                    title="Dark-Mode-Bild — auf ein anderes Bild ziehen, um neu zuzuordnen"
                    style={{ position: "relative", width: 44, height: 44, cursor: "grab" }}
                  >
                    <div style={{
                      width: "100%", height: "100%", borderRadius: 6, overflow: "hidden",
                      border: "2px solid #8b5cf6",
                      background: `url(${darkImages[index].url}) center/cover`,
                    }} />
                    <span style={{
                      position: "absolute", top: -6, left: -6,
                      fontSize: 12, background: "#8b5cf6", borderRadius: "50%",
                      width: 16, height: 16, textAlign: "center", lineHeight: "16px",
                    }}>🌙</span>
                    <button
                      onClick={() => assignDarkImage(index, null)}
                      title="Dark-Bild entfernen"
                      style={{
                        position: "absolute", bottom: -6, right: -6,
                        background: "rgba(0,0,0,0.7)", color: "white", border: "none",
                        borderRadius: "50%", width: 16, height: 16, fontSize: 10, cursor: "pointer", padding: 0,
                      }}
                    >✕</button>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleLightDrop(e, index)}
                    title="Dark-Mode-Bild hinzufügen (Datei wählen oder ein Dark-Bild hierher ziehen)"
                    style={{
                      width: 44, height: 44, borderRadius: 6, flexShrink: 0,
                      border: `2px dashed ${isDark ? "#5a5a5a" : "#c4c4c4"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", fontSize: 16, opacity: 0.6,
                    }}
                  >
                    ☀️
                    <input
                      type="file" accept="image/*" style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadDarkImage(file, index);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )
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