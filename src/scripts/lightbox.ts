/**
 * Image Lightbox
 * Clicking an image inside the article body opens it full-size in an overlay.
 */
export function initLightbox(): void {
  let overlay = document.querySelector<HTMLElement>(".lightbox-overlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className =
      "lightbox-overlay fixed inset-0 z-[60] hidden items-center justify-center bg-black/85 backdrop-blur-sm p-4 cursor-zoom-out";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-hidden", "true");
    overlay.setAttribute(
      "aria-label",
      window.__i18n?.t["lightbox.close"] || "Close enlarged image",
    );

    const img = document.createElement("img");
    img.className =
      "lightbox-image max-h-[90vh] max-w-full rounded-sm object-contain shadow-2xl";
    overlay.appendChild(img);

    document.body.appendChild(overlay);

    const close = () => {
      overlay!.classList.add("hidden");
      overlay!.classList.remove("flex");
      overlay!.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    };

    overlay.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  const lightboxImg =
    overlay.querySelector<HTMLImageElement>(".lightbox-image")!;

  document
    .querySelectorAll<HTMLImageElement>(".prose img:not([data-lightbox-bound])")
    .forEach((img) => {
      img.dataset.lightboxBound = "true";
      img.classList.add("cursor-zoom-in");
      img.addEventListener("click", () => {
        lightboxImg.src = img.currentSrc || img.src;
        lightboxImg.alt = img.alt;
        overlay!.classList.remove("hidden");
        overlay!.classList.add("flex");
        overlay!.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
      });
    });
}
