import {
  db,
  storage,
  ref,
  onValue,
  push,
  set,
  storageRef,
  uploadBytes,
  getDownloadURL,
} from "./firebase.js";

const LIVE_UPDATES_PATH = "race/live_updates";
const STORAGE_FOLDER = "live_updates";
const MAX_WIDTH = 800;
const JPEG_QUALITY = 0.8;
const UPLOAD_ACTIONS = ["upload-live-image", "submit-live-photo"];
const UPLOAD_TIMEOUT_MS = 60_000;

function queryTarget(name) {
  return document.querySelector(`[data-target="${name}"]`);
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
  const fileRef = storageRef(storage, `${STORAGE_FOLDER}/${timestamp}.jpg`);

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
    }),
    10_000,
    "Database write"
  );
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

function createGalleryItem(key, item) {
  const article = document.createElement("article");
  article.setAttribute("data-update-id", key);

  const img = document.createElement("img");
  img.src = item.imageUrl;
  img.alt = item.caption || "עדכון מהשטח";
  img.loading = "lazy";

  const caption = document.createElement("p");
  caption.textContent = item.caption || "";

  const time = document.createElement("time");
  time.dateTime = String(item.timestamp);
  time.textContent = formatGalleryTime(item.timestamp);

  article.appendChild(img);
  if (item.caption) article.appendChild(caption);
  article.appendChild(time);

  return article;
}

let renderedKeys = new Set();
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

function handleGallerySnapshot(snapshot) {
  const grid = queryTarget("gallery-grid");
  if (!grid) return;

  if (!snapshot.exists()) {
    grid.innerHTML =
      '<p data-target="gallery-empty" style="grid-column:1/-1;color:var(--muted);text-align:center;padding:24px;font-size:.85rem">אין עדכונים עדיין</p>';
    renderedKeys.clear();
    return;
  }

  const emptyMsg = queryTarget("gallery-empty");
  if (emptyMsg) emptyMsg.remove();

  const entries = Object.entries(snapshot.val()).sort(
    (a, b) => (a[1].timestamp || 0) - (b[1].timestamp || 0)
  );

  for (const [key, item] of entries) {
    if (!item?.imageUrl || renderedKeys.has(key)) continue;
    renderedKeys.add(key);
    grid.prepend(createGalleryItem(key, item));
  }
}

function startGalleryListener() {
  if (unsubscribe) return;

  unsubscribe = onValue(ref(db, LIVE_UPDATES_PATH), handleGallerySnapshot, (err) => {
    console.error("live_updates listener error:", err);
  });
}

/**
 * Initialize Live Update Gallery infrastructure.
 * @param {{ isAdmin: () => boolean }} options
 */
export function initLiveUpdates({ isAdmin }) {
  isAdminFn = isAdmin;
  startGalleryListener();
}
