/**
 * Profile-logo helper. Turns a user-picked image File into a small, square
 * data-URL that fits inside a Firestore doc (well under the 1 MB limit), so no
 * Firebase Storage bucket is needed. The whole image is *contained* (never
 * cropped) inside a transparent square, which suits logos as well as photos.
 */

export const AVATAR_SIZE = 256;
export const AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024; // reject >10 MB source files
const PNG_FALLBACK_BYTES = 400 * 1024; // if PNG is bigger than this, re-encode as JPEG

/**
 * @param {File} file - an image file from an <input type="file">
 * @param {number} size - output square edge in px
 * @returns {Promise<string>} a data:image/... URL, ~256px square
 */
export function fileToAvatarDataUrl(file, size = AVATAR_SIZE) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("No file selected."));
    if (!file.type || !file.type.startsWith("image/"))
      return reject(new Error("Please choose an image file."));
    if (file.size > AVATAR_MAX_SOURCE_BYTES)
      return reject(new Error("Image is too large (max 10 MB)."));

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That image couldn't be loaded."));
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          // Contain: fit the entire image inside the square, centered, with
          // transparent padding — logos keep their whole shape, no cropping.
          const scale = Math.min(size / img.width, size / img.height) || 1;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
          let url = canvas.toDataURL("image/png");
          // Photos compress far smaller as JPEG; fall back when PNG is heavy.
          if (url.length > PNG_FALLBACK_BYTES) url = canvas.toDataURL("image/jpeg", 0.85);
          resolve(url);
        } catch (e) {
          reject(new Error("Couldn't process that image."));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
