// Verkleinert ein Bild client-seitig vor dem Upload, um Ladezeiten im Shop zu verbessern
// und Speicherplatz zu sparen. Skaliert auf eine maximale Kantenlänge, PNGs behalten
// Transparenz, alles andere wird als JPEG re-encodiert.
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

      // Bild ist schon klein genug - nichts zu tun.
      if (scale >= 1) {
        resolve(file);
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          // Falls die Kompression (selten) größer als das Original wird, Original behalten.
          resolve(file);
          return;
        }
        const resized = new File([blob], file.name, { type: outputType, lastModified: Date.now() });
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
