import {
  db,
  storage,
  ref,
  onValue,
  push,
  set,
  remove,
  storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "./firebase.js";

const LIVE_UPDATES_PATH = "race/live_updates";
const STORAGE_FOLDER = "live_updates";
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.8;
const UPLOAD_ACTIONS = ["upload-live-image", "submit-live-photo"];
const UPLOAD_TIMEOUT_MS = 60_000;
const GALLERY_GRID_TARGETS = ["gallery-grid", "admin-gallery-grid"];
const GALLERY_EMPTY_HTML =
  '<p data-target="gallery-empty" style="grid-column:1/-1;color:var(--muted);text-align:center;padding:24px;font-size:.85rem">אין עדכונים עדיין</p>';
const ADMIN_GALLERY_EMPTY_HTML =
  '<p data-target="admin-gallery-empty" style="grid-column:1/-1;color:var(--muted);text-align:center;padding:24px;font-size:.85rem">אין עדכונים עדיין</p>';

function queryTarget(name) {
  return document.querySelector(`[data-target="${name}"]`);
}

function queryTargets(name) {
  return document.querySelectorAll(`[data-target="${name}"]`);
}

function getGalleryGrids() {
  return GALLERY_GRID_TARGETS.flatMap((name) => [...queryTargets(name)]);
}

function emptyHtmlForGrid(grid) {
  return grid.dataset.target === "admin-gallery-grid"
    ? ADMIN_GALLERY_EMPTY_HTML
    : GALLERY_EMPTY_HTML;
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Compression failed"))),
      "image/jpeg",
      quality
    );
  });
}

/**
 * Resize and compress an image file via Canvas API.
 * Target: max width 800px, JPEG quality 0.8.
 */
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return canvasToBlob(canvas, JPEG_QUALITY);
}

function queryUploadButton() {
  for (const action of UPLOAD_ACTIONS) {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) return btn;
  }
  return null;
}

function isImageFile(file) {
  return Boolean(file?.type?.startsWith("image/"));
}

function withTimeout(promise, ms, operation) {
  let timerId;
  const timeout = new Promise((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`${operation} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timerId));
}

function formatUploadError(error) {
  if (!error) return "שגיאה לא ידועה בהעלאה";

  const code = error.code || "";
  const message = typeof error.message === "string" ? error.message : String(error);

  if (!navigator.onLine) return "אין חיבור לרשת. בדוק את החיבור ונסה שוב.";
  if (code === "storage/unauthorized") return "אין הרשאה לאחסון. בדוק את הגדרות Firebase Storage.";
  if (code === "storage/unauthenticated") return "נדרשת התחברות לאחסון.";
  if (code === "storage/quota-exceeded") return "מכסת האחסון מלאה.";
  if (code === "storage/canceled") return "ההעלאה בוטלה.";
  if (code === "storage/retry-limit-exceeded") return "ההעלאה נכשלה לאחר ניסיונות חוזרים.";
  if (code === "storage/unknown" || message.includes("storage")) {
    return "שגיאת אחסון: " + (message || "הדלי אינו זמין או לא הוגדר.");
  }
  if (message.includes("timed out")) return "ההעלאה נמשכה יותר מדי זמן. נסה שוב.";
  if (message === "Compression failed") return "דחיסת התמונה נכשלה. נסה תמונה אחרת.";

  return message || "שגיאה בהעלאה";
}

function beginUploadUI(submitBtn, statusEl) {
  if (statusEl) {
    statusEl.dataset.errorPersistent = "0";
    statusEl.textContent = "";
  }
  if (!submitBtn) return;

  if (!submitBtn.dataset.defaultLabel) {
    submitBtn.dataset.defaultLabel = submitBtn.textContent;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "מעלה...";
}

function showUploadSuccess(submitBtn, statusEl, fileInput, captionInput, defaultBtnLabel) {
  if (fileInput) fileInput.value = "";
  if (captionInput) captionInput.value = "";
  if (statusEl) {
    statusEl.dataset.errorPersistent = "0";
    statusEl.textContent = "הועלה בהצלחה";
  }
  if (submitBtn) submitBtn.textContent = "הועלה בהצלחה";

  setTimeout(() => {
    if (statusEl) statusEl.textContent = "";
    if (submitBtn) {
      submitBtn.textContent = submitBtn.dataset.defaultLabel || defaultBtnLabel;
    }
  }, 2500);
}

async function runUploadPipeline(file, caption) {
  const blob = await withTimeout(compressImage(file), 15_000, "Image compression");
  const timestamp = Date.now();
  const storagePath = `${STORAGE_FOLDER}/${timestamp}.jpg`;
  const fileRef = storageRef(storage, storagePath);

  await withTimeout(
    uploadBytes(fileRef, blob, { contentType: "image/jpeg" }),
    30_000,
    "Storage upload"
  );

  const imageUrl = await withTimeout(getDownloadURL(fileRef), 10_000, "Download URL");

  await withTimeout(
    set(push(ref(db, LIVE_UPDATES_PATH)), {
      imageUrl,
      caption,
      timestamp,
      storagePath,
    }),
    10_000,
    "Database write"
  );
}

function resolveStoragePath(item) {
  if (item?.storagePath) return item.storagePath;
  if (!item?.imageUrl) return "";

  try {
    const url = new URL(item.imageUrl);
    const encodedPath = url.pathname.split("/o/")[1]?.split("?")[0];
    if (encodedPath) return decodeURIComponent(encodedPath);
  } catch {
    return "";
  }

  return "";
}

function formatGalleryTime(timestamp) {
  const d = new Date(timestamp);
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    " · " +
    String(d.getDate()).padStart(2, "0") +
    "/" +
    String(d.getMonth() + 1).padStart(2, "0")
  );
}

function createGalleryItem(key, item, includeDelete = false) {
  const article = document.createElement("article");
  article.setAttribute("data-update-id", key);

  const img = document.createElement("img");
  img.src = item.imageUrl;
  img.alt = item.caption || "עדכון מהשטח";
  img.loading = "lazy";

  if (includeDelete) {
    const mediaWrap = document.createElement("div");
    mediaWrap.setAttribute("data-target", "gallery-media-wrap");

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.setAttribute("data-action", "delete-image");
    deleteBtn.setAttribute("data-doc-id", key);
    deleteBtn.setAttribute("data-storage-path", resolveStoragePath(item));
    deleteBtn.setAttribute("aria-label", "מחק תמונה");
    deleteBtn.textContent = "🗑️";

    mediaWrap.appendChild(img);
    mediaWrap.appendChild(deleteBtn);
    article.appendChild(mediaWrap);
  } else {
    article.appendChild(img);
  }

  const caption = document.createElement("p");
  caption.textContent = item.caption || "";

  const time = document.createElement("time");
  time.dateTime = String(item.timestamp);
  time.textContent = formatGalleryTime(item.timestamp);

  if (item.caption) article.appendChild(caption);
  article.appendChild(time);

  return article;
}

function getSortedGalleryEntries(snapshot) {
  if (!snapshot.exists()) return [];

  return Object.entries(snapshot.val())
    .filter(([, item]) => item?.imageUrl)
    .sort((a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0));
}

function renderGalleryGrid(grid, entries) {
  grid.innerHTML = "";

  if (!entries.length) {
    grid.innerHTML = emptyHtmlForGrid(grid);
    return;
  }

  [...entries].reverse().forEach(([key, item]) => {
    const includeDelete = grid.dataset.target === "admin-gallery-grid";
    grid.appendChild(createGalleryItem(key, item, includeDelete));
  });
}

function handleGallerySnapshot(snapshot) {
  const grids = getGalleryGrids();
  if (!grids.length) return;

  const entries = getSortedGalleryEntries(snapshot);
  grids.forEach((grid) => renderGalleryGrid(grid, entries));
}

let unsubscribe = null;
let isAdminFn = () => false;

export async function handleUploadLiveImage() {
  if (!isAdminFn()) return;

  const fileInput = queryTarget("upload-photo-input");
  const captionInput = queryTarget("upload-caption-input");
  const statusEl = queryTarget("upload-status");
  const submitBtn = queryUploadButton();
  const defaultBtnLabel = submitBtn?.dataset.defaultLabel || submitBtn?.textContent || "העלה עדכון";

  const file = fileInput?.files?.[0];
  if (!file) {
    if (statusEl) statusEl.textContent = "נא לבחור תמונה";
    return;
  }

  if (!isImageFile(file)) {
    if (statusEl) statusEl.textContent = "יש לבחור קובץ תמונה בלבד";
    return;
  }

  beginUploadUI(submitBtn, statusEl);

  try {
    const caption = captionInput?.value?.trim() || "";

    await withTimeout(
      runUploadPipeline(file, caption),
      UPLOAD_TIMEOUT_MS,
      "Upload"
    );

    showUploadSuccess(submitBtn, statusEl, fileInput, captionInput, defaultBtnLabel);
  } catch (error) {
    console.error("Upload failed:", error);
    const userMessage = formatUploadError(error);
    if (statusEl) {
      statusEl.dataset.errorPersistent = "1";
      statusEl.textContent = userMessage;
    }
    if (submitBtn) {
      submitBtn.textContent = submitBtn.dataset.defaultLabel || defaultBtnLabel;
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

export async function handleDeleteLiveImage(docId, storagePath) {
  if (!isAdminFn() || !docId) return;

  if (storagePath) {
    try {
      await deleteObject(storageRef(storage, storagePath));
    } catch (error) {
      if (error?.code !== "storage/object-not-found") throw error;
    }
  }

  await remove(ref(db, `${LIVE_UPDATES_PATH}/${docId}`));
}

export function startLiveUpdatesListener() {
  if (unsubscribe) return;

  unsubscribe = onValue(ref(db, LIVE_UPDATES_PATH), handleGallerySnapshot, (err) => {
    console.error("live_updates listener error:", err);
  });
}

export function stopLiveUpdatesListener() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  getGalleryGrids().forEach((grid) => {
    grid.innerHTML = emptyHtmlForGrid(grid);
  });
}

/**
 * Wire admin gate for uploads (listener starts after auth).
 * @param {{ isAdmin: () => boolean }} options
 */
export function initLiveUpdates({ isAdmin }) {
  isAdminFn = isAdmin;
}
