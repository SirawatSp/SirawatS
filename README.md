# Roam — trip photo organizer

A web app for finding each member of your travel squad and separating their solo photos from group shots. Photos and face recognition stay in the browser; there is no upload backend, account, or API key.

## Run

Requires Node.js 20.19+ or 22.12+ (validated with Node 24) and a current browser.

```sh
cd /workspace/SirawatS
npm ci
npm run dev
```

The development server uses port 5173. `npm run dev` first prepares the local face models from the pinned npm package and checks their SHA256 hashes. No model CDN is required. Allow browser site storage and use a normal browsing window to retain your library.

The original portfolio source, `Webpage`, is preserved. The old portfolio-only Python server does not serve this new app; use the npm commands above.

## Organize a trip

1. Create a trip and add photos or a folder. Import JPG, PNG, WebP, AVIF, or GIF; convert HEIC/RAW first. Exact duplicate files are skipped across the library.
2. Click a photo, then a detected face, and give that person a name. Alternatively, use **Add a person** with a clear reference portrait. Repeat for your four squad members. Naming a face rechecks existing photos; future imports match automatically. You can keep up to 16 squad members and eight confirmed references per person.
3. Choose a person and **Solo shots** to find their one-person photos. **Together** contains photos with multiple detected or manually confirmed people. Unknown faces remain **Needs a name** instead of being forced into a match.
4. Review suggested face labels. Use **Total people in this photo** to account for people with hidden or missed faces. A confirmed face label is preserved when other photos are regrouped.
5. Export the current view or select particular photos. The ZIP contains untouched originals in named person folders for solo images, plus `Groups`, `Unassigned`, and `No faces` folders where applicable. The accompanying manifest includes file assignments, not face descriptors. Duplicate names are preserved with unique filenames.

Search filters filenames. Date sorting uses the file’s modification date, not EXIF capture time. All active filters intersect: choosing a person alone includes group images containing them; add **Solo shots** to exclude those groups.

## Storage and limitations

Originals, thumbnails, reference faces, and labels are stored in IndexedDB on the current browser origin. They are not synced between browsers or devices. Export originals before clearing browser data. **Library & storage** lets you clear imported copies and face data with confirmation; your source files are untouched.

Face detection and identity matching can miss or misidentify faces, particularly small, side-facing, dark, or occluded ones. “Solo” is based on one detected face unless you correct the count; review results before sharing. Analysis runs sequentially; the stop button finishes the current photo before stopping. The first analysis loads around 12 MB of local models and can take longer on devices without hardware acceleration. Large ZIP exports are assembled in memory; use smaller selections if necessary. Recognition failures remain visible with a retry option and are excluded from completed solo/group categories.

Fonts, model weights, and inference are served locally. The app makes no external runtime requests. Face models and the inference library are supplied by `@vladmandic/face-api` under its included license, copied to `public/models/LICENSE` during preparation. Font packages include their open font licenses.

## Build and validate

```sh
npm run build
npm run preview
npm test
npm run test:browser
```

Browser tests use Chromium at `/usr/bin/chromium`. Set `CHROMIUM_PATH` to your Chromium executable if it is elsewhere. They run actual detection on the library’s bundled example photo and check naming, matching, corrected solo/group filtering, persistence, duplicate import, ZIP contents, and the mobile layout. They use their own temporary browser storage, never your library.

`npm run build` creates `dist/`, including models and their license, suitable for a static web host. Use HTTPS in deployment so browser cryptography and storage work. Do not expose the development server publicly as a production server. No publication or deployment is performed by these commands.

## Put Roam on the web

The app needs a static HTTPS host. Your photo library remains in your browser; deploying the app does not upload your photos.

### Drag-and-drop hosting

The prepared `roam-web.zip` contains a `roam` folder with `index.html`, local assets, fonts, and face models. Unzip it, sign into [Netlify Drop](https://app.netlify.com/drop), and drop the **roam folder** onto the upload area. Netlify supplies the web link. Upload the complete folder, including `models`; do not just upload `index.html` or try opening it directly from your file manager.

To rebuild a portable website package yourself:

```sh
npm ci
npm run build -- --base=./
```

Upload the resulting `dist` folder. The included `netlify.toml` also supports connecting the source repository to Netlify instead of uploading the built files.

### GitHub Pages

For the prepared static `gh-pages` branch, choose **Settings → Pages → Build and deployment → Source: Deploy from a branch**, then select **gh-pages**, **/ (root)**, and save. This publishes the already built site; no build command is needed in GitHub. Only treat the web URL as live once GitHub confirms deployment.

The workflow in `.github/workflows/deploy-pages.yml` builds and deploys the complete app when `main` is updated or the workflow is run manually. First enable **Settings → Pages → Build and deployment → Source: GitHub Actions** in the repository. The workflow gets the correct project path from GitHub Pages so scripts, fonts, and face models work below `/SirawatS/`.

For local validation of a project-path build:

```sh
npm run build -- --base=/SirawatS/
```

Hosting setup and a successful deployment must finish before treating a Pages URL as live. Switching from a local address to the hosted site creates a separate browser library. Reimport your originals there; existing photo ZIP exports are not backups of names or face-recognition data.
