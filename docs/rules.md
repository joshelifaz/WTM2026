# System Prompt — Senior Frontend Developer

> בכל תחילת שיחה ב-Cursor: `@docs/rules.md` + "Act according to these rules"

---

```
Role: Senior Frontend Developer.
Task: Implement a zero-dependency full-screen Lightbox with download functionality for the live updates gallery.

Context:
- Current branch: 'feat/gallery-ux-enhancements'
- We need to add a full-screen Lightbox overlay to display images in the gallery when clicked.
- The Lightbox must contain a close button (X) and a download button (↓).
- It must be styled purely with vanilla CSS (fitting the current dark/light mode patterns) without any external libraries.
- The image source to download needs to be fetched, converted to a blob, and triggered for download so it doesn't just open in a new tab.

Implementation Steps:

1. Update `index.html`:
   - Add the following Lightbox HTML right before the closing `</div>` tag (near the finish race modal):
     ```html
     <div id="gallery-lightbox" data-target="gallery-lightbox" class="hidden" style="position:fixed;inset:0;background:rgba(10,15,24,0.95);backdrop-filter:blur(10px);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;">
       <div style="position:absolute;top:20px;left:20px;right:20px;display:flex;justify-content:space-between;align-items:center;z-index:10001;direction:rtl;">
         <button type="button" data-action="close-lightbox" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;width:44px;height:44px;border-radius:50%;font-size:1.5rem;display:flex;align-items:center;justify-content:center;cursor:pointer;backdrop-filter:blur(4px);">&times;</button>
         <button type="button" id="lightbox-download-btn" data-action="download-lightbox-image" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:0 20px;height:44px;border-radius:22px;font-size:0.9rem;font-weight:600;display:flex;align-items:center;gap:8px;cursor:pointer;backdrop-filter:blur(4px);">
           <span>הורד תמונה</span>
           <span style="font-size:1.1rem">↓</span>
         </button>
       </div>
       <img id="lightbox-img" data-target="lightbox-img" src="" alt="תמונה מוגדלת" style="max-width:95vw;max-height:85vh;object-fit:contain;border-radius:8px;box-shadow:0 10px 40px rgba(0,0,0,0.5);">
     </div>
     ```
   - Make sure to update CSS in `<style>` if needed to ensure `.hidden { display: none !important; }` applies to the lightbox. (It already exists for `[data-target="login-screen"].hidden`). Let's add `#gallery-lightbox.hidden { display: none !important; }` to the top CSS block.

2. Update `src/liveUpdates.js`:
   - Add cursor pointer to gallery images: In `createGalleryItem()`, add `img.style.cursor = 'pointer';` and add a click event listener to the `img` element that calls a new function `openLightbox(item.imageUrl)`.
   - Create `openLightbox(url)`:
     - Get `queryTarget("gallery-lightbox")` and remove the `"hidden"` class.
     - Get `queryTarget("lightbox-img")` and set its `src` to the passed `url`.
     - Set the `data-current-url` attribute on the download button to the passed `url`.
   - Create `closeLightbox()`:
     - Get `queryTarget("gallery-lightbox")` and add the `"hidden"` class.
     - Clear the `src` of the image to free memory.
   - Create `downloadLightboxImage()`:
     - Get the URL from the download button's `data-current-url`.
     - Fetch the URL as a blob to force download: `fetch(url).then(res => res.blob()).then(blob => { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'WTM2026_LiveUpdate_' + Date.now() + '.jpg'; link.click(); URL.revokeObjectURL(link.href); })`.
   - Export `closeLightbox` and `downloadLightboxImage` so they can be wired up.

3. Update `src/main.js`:
   - Import `closeLightbox` and `downloadLightboxImage` from `./liveUpdates.js`.
   - In `initActionDelegation()`, inside the `switch (el.dataset.action)`, add cases:
     - `case "close-lightbox": closeLightbox(); break;`
     - `case "download-lightbox-image": downloadLightboxImage(); break;`
   - Expose `closeLightbox` and `downloadLightboxImage` to `window` in `exposeUiGlobals()` just in case.

Terminal expected: npm run dev
```

---

## כללי עבודה כלליים (פרויקט WTM2026)

1. **Zero-dependency** — אין להוסיף ספריות חיצוניות אלא אם הופקד במפורש.
2. **Vanilla JS** — ES Modules, `data-target` / `data-action` delegation.
3. **Firebase יחיד** — `wtm2026-fb982`, Realtime Database (לא Firestore).
4. **עברית RTL** — כל UI למשתמש בעברית, כיוון RTL.
5. **מינימום diff** — שינוי ממוקד, ללא over-engineering.
6. **תיעוד** — עדכן `architecture.md` / `features.md` כשמשנים מבנה או פיצ'רים.
