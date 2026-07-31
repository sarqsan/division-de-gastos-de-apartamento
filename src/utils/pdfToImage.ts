import * as pdfjsLib from "pdfjs-dist";

// Configure worker using CDN to ensure browser runtime execution without complex Vite bundling
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Converts a File object (Image or PDF) into a JPEG Data URL string (data:image/jpeg;base64,...).
 * If the file is a PDF, it renders the first page onto a canvas and returns the image data URL.
 */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const fileName = file.name ? file.name.toLowerCase() : "";
  const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf") || fileName.includes(".pdf");

  if (isPdf) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      // Render Page 1 of PDF
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 }); // 2x resolution for high clarity
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (!context) {
        throw new Error("Could not get 2D canvas context for PDF rendering");
      }

      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas: canvas,
      } as any).promise;

      return canvas.toDataURL("image/jpeg", 0.85);
    } catch (err) {
      console.error("Error converting PDF file to image:", err);
    }
  }

  // Handle standard images or fallbacks (JPG, PNG, WEBP, BMP, SVG, HEIC, etc.)
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (!dataUrl) {
        resolve("");
        return;
      }

      // Try drawing to canvas to convert to clean JPEG data URL
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width || 800;
          canvas.height = img.naturalHeight || img.height || 1000;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
            return;
          }
        } catch (e) {
          console.warn("Canvas export warning, using raw dataUrl:", e);
        }
        resolve(dataUrl);
      };
      img.onerror = () => {
        // Return raw data URL if Image element cannot load
        resolve(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

/**
 * Helper for jsPDF to load any image URL or Data URL (including PDFs via pdfjs fallback)
 * and return its dimensions and clean JPEG data URL for embedding.
 */
export async function getReportImageDataUrl(url: string): Promise<{ dataUrl: string; width: number; height: number } | null> {
  if (!url) return null;

  // If it's a PDF data URL, convert page 1
  if (url.startsWith("data:application/pdf")) {
    try {
      const loadingTask = pdfjsLib.getDocument({ url });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.0 });
      
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        await page.render({ canvasContext: context, viewport, canvas } as any).promise;
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        return { dataUrl, width: canvas.width, height: canvas.height };
      }
    } catch (e) {
      console.error("Error converting PDF data URL for report:", e);
    }
  }

  // Image Data URL or standard HTTP URL
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith("data:")) {
      img.crossOrigin = "Anonymous";
    }
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 600;
      canvas.height = img.naturalHeight || img.height || 800;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        try {
          resolve({
            dataUrl: canvas.toDataURL("image/jpeg", 0.85),
            width: canvas.width,
            height: canvas.height,
          });
        } catch (e) {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
