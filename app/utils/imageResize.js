// Verkleinert ein Bild client-seitig vor dem Upload, um Ladezeiten im Shop zu verbessern
// und Speicherplatz zu sparen. Skaliert auf eine maximale Kantenlänge. PNGs OHNE echte
// Transparenz (die meisten Fotos, z.B. aus Bildagenturen) werden zu JPEG konvertiert, da PNG
// verlustfrei komprimiert und bei Fotos kaum kleiner wird - nur PNGs mit tatsächlich genutztem
// Alpha-Kanal (Freisteller, Icons) bleiben PNG.
export function resizeImageFile(file, { maxDimension = 2200, quality = 0.85 } = {}) {
  return new Promise((resolve) => {
    // GIFs (evtl. animiert) und SVGs unverändert lassen - Canvas würde Animation/Vektor zerstören.
    if (file.type === "image/gif" || file.type === "image/svg+xml") {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.round(width * scale);
      const targetHeight = Math.round(height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      const outputType = file.type === "image/png" && hasUsedAlphaChannel(ctx, targetWidth, targetHeight)
        ? "image/png"
        : "image/jpeg";

      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          // Falls die Kompression (selten) größer als das Original wird, Original behalten.
          resolve(file);
          return;
        }
        const newName = outputType === "image/jpeg" ? file.name.replace(/\.\w+$/, ".jpg") : file.name;
        const resized = new File([blob], newName, { type: outputType, lastModified: Date.now() });
        resolve(resized);
      }, outputType, quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file); // Bei Fehler unverändertes Original hochladen statt Upload zu blockieren.
    };

    img.src = objectUrl;
  });
}

// Prüft stichprobenartig, ob im Bild überhaupt ein Pixel mit Transparenz (alpha < 255)
// vorkommt. Reine Fotos ohne Freistellung haben durchgehend alpha=255 und profitieren von
// der verlustbehafteten JPEG-Kompression.
function hasUsedAlphaChannel(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // z.B. bei CORS-Restriktionen auf getImageData - im Zweifel Transparenz annehmen und PNG behalten.
    return true;
  }
}
