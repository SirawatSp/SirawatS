import './style.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import { analyzePhoto, loadModels, matchFaces } from './face-engine.js';
import { reclassifyFaces } from './matching.js';
import { getLibrary, savePhoto, deletePhoto, savePerson, deletePerson, saveTrip, clearLibrary } from './storage.js';
import { exportPhotos } from './export.js';
import { effectiveCount, filterPhotos, getStats, photoPersonIds } from './organize.js';

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 6 0 0 1 16 0v2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  mountain: '<path d="m2 20 7-14 5 9 3-5 5 10ZM6 12l3 2 3-2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.image}</svg>`;
const escape = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const state = { photos: [], people: [], trips: [], tripId: 'all', personId: 'all', kind: 'all', query: '', sort: 'newest', selected: new Set(), busy: false, cancel: false, exportBusy: false, progress: '', error: '', mobile: false };
const urls = new Map();
const root = document.querySelector('#app');
const dialog = document.createElement('dialog');
dialog.className = 'modal';
document.body.append(dialog);
const toastEl = document.createElement('div');
toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.append(toastEl);
let toastTimer, previewUrl;
function toast(message) { clearTimeout(toastTimer); toastEl.textContent = message; toastEl.classList.add('visible'); toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 5500); }
function blobUrl(blob, key) { if (!blob) return ''; if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob)); return urls.get(key); }
function refreshUrls() { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }
const personById = id => state.people.find(p => p.id === id);
const tripById = id => state.trips.find(t => t.id === id);
const visible = () => filterPhotos(state.photos, state);
function setProgress(text) { state.progress = text; const el = document.querySelector('#progress-text'); if (el) el.textContent = text; }
function closeDialog() { dialog.close(); if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } }
function openDialog(html, className = '') { dialog.className = `modal ${className}`; dialog.innerHTML = html; if (!dialog.open) dialog.showModal(); }
const closeButton = `<button type="button" class="icon-button modal-close" data-action="close-dialog" aria-label="Close dialog">${icon('close')}</button>`;
function dialogError(error) { const el = dialog.querySelector('.form-error'); if (el) el.textContent = error.message || String(error); else toast(error.message || String(error)); }

function render() {
  const total = state.photos.length;
  const scoped = state.photos.filter(p => state.tripId === 'all' || p.tripId === state.tripId);
  const stats = getStats(scoped);
  const currentPerson = personById(state.personId);
  const title = currentPerson ? `${escape(currentPerson.name)}’s photos` : state.tripId !== 'all' ? escape(tripById(state.tripId)?.name || 'Trip photos') : 'Your photo library';
  root.innerHTML = `
    <aside class="sidebar ${state.mobile ? 'is-open' : ''}">
      <button class="icon-button close-mobile-nav" data-action="menu" aria-label="Close navigation">${icon('close')}</button>
      <a class="brand" href="#" data-action="reset-filters" aria-label="Roam home"><span class="brand-mark">${icon('mountain')}</span>roam<span class="brand-dot">.</span></a>
      <div class="workspace-name"><span class="workspace-avatar">S</span><div>My travel space<small>Personal library</small></div><span class="local-dot" title="Stored on this device"></span></div>
      <p class="nav-label">LIBRARY</p>
      <button class="nav-item ${state.personId === 'all' && state.kind === 'all' && state.tripId === 'all' ? 'active' : ''}" data-action="reset-filters">${icon('grid')}<span>All photos</span><span class="nav-count">${total}</span></button>
      <button class="nav-item ${state.kind === 'solo' ? 'active' : ''}" data-action="nav-kind" data-kind="solo">${icon('person')}<span>Solo shots</span><span class="nav-count">${stats.solo}</span></button>
      <button class="nav-item ${state.kind === 'group' ? 'active' : ''}" data-action="nav-kind" data-kind="group">${icon('people')}<span>Together</span><span class="nav-count">${stats.group}</span></button>
      <button class="nav-item ${state.kind === 'unassigned' ? 'active' : ''}" data-action="nav-kind" data-kind="unassigned">${icon('spark')}<span>Needs a name</span>${stats.unassigned ? `<span class="attention-count">${stats.unassigned}</span>` : ''}</button>
      <div class="nav-section-heading"><p class="nav-label">YOUR TRIPS</p><button class="tiny-button" data-action="add-trip" aria-label="Add a trip">${icon('plus')}</button></div>
      <div class="trip-list">${state.trips.map((t, i) => `<button class="nav-item ${state.tripId === t.id ? 'active' : ''}" data-action="trip" data-id="${escape(t.id)}"><span class="trip-color color-${i % 4}"></span><span>${escape(t.name)}</span><span class="nav-count">${state.photos.filter(p => p.tripId === t.id).length}</span></button>`).join('') || '<p class="nav-empty">A new adventure belongs here.</p>'}</div>
      <button class="add-trip-link" data-action="add-trip">${icon('plus')} Create a trip</button>
      <div class="sidebar-bottom"><div class="privacy-card">${icon('shield')}<strong>Your memories stay yours.</strong><p>Face matching happens on your device. Your photos are never uploaded.</p><span>Private by design ${icon('check')}</span></div><button class="settings-link" data-action="about">${icon('info')} Library & storage</button><div class="sidebar-footer"><span class="mini-brand">roam.</span><span>Less sorting. More living.</span></div></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><div class="breadcrumb"><button class="icon-button mobile-menu" data-action="menu" aria-label="Toggle navigation">${icon('menu')}</button><span>My workspace</span>${icon('chevron')}<strong>${state.tripId === 'all' ? 'All trips' : escape(tripById(state.tripId)?.name || 'Trip')}</strong></div><div class="topbar-right"><span class="device-badge"><span></span> On this device</span><button class="profile-avatar" data-action="about" aria-label="Open library settings">S</button></div></header>
      <main>
        <section class="welcome-banner"><div class="welcome-copy"><span class="eyebrow">A LITTLE LESS SORTING. A LOT MORE MEMORIES.</span><h1>Good trips. Great company.<br><span>Beautifully organized.</span></h1><p>Find your people in every adventure.<br>We’ll help you bring their moments together.</p><div class="welcome-note">${icon('spark')} Find faces. Name your squad. Make it personal.</div></div><div class="travel-art" aria-hidden="true"><div class="art-dots"></div><div class="postcard postcard-back"><div class="postcard-inner city-art"><span class="art-sun"></span><i></i><b></b><em></em></div><span>the places we go</span></div><div class="postcard postcard-front"><div class="postcard-inner mountain-art"><span class="art-sun"></span><i></i><b></b><em></em></div><span>the people we go with ♡</span></div><span class="art-sticker">${icon('people')} made of memories</span><span class="art-spark">✳</span><span class="art-flight">↗</span></div></section>
        <section class="library-section">
          <div class="section-heading"><div><div class="section-eyebrow">THE MOMENTS THAT MATTER</div><h2>${title}<span class="total-badge">${scoped.length}</span></h2><p>Every face has a story. Find the photos that tell yours.</p></div><div class="heading-actions"><button class="button secondary" data-action="export" ${!total || state.exportBusy ? 'disabled' : ''}>${icon('download')}<span>${state.exportBusy ? 'Preparing…' : 'Export photos'}</span></button><button class="button primary" data-action="import" ${state.busy ? 'disabled' : ''}>${icon('plus')} Add photos</button></div></div>
          ${state.error ? `<div class="error-banner" role="alert">${icon('info')} ${escape(state.error)}</div>` : ''}
          <div class="squad-section"><div class="squad-label">${icon('people')}<div><strong>Your travel squad</strong><span>Name a face once. Find them everywhere.</span></div></div><div class="people-row"><button class="person-chip ${state.personId === 'all' ? 'selected' : ''}" data-action="person-filter" data-id="all"><span class="everyone-avatar">${icon('people')}</span><span>Everyone</span></button>${state.people.map(p => `<button class="person-chip ${state.personId === p.id ? 'selected' : ''}" data-action="person-filter" data-id="${escape(p.id)}"><img src="${blobUrl(p.thumbnail, 'person-' + p.id)}" alt=""><span>${escape(p.name)}</span></button>`).join('')}<button class="add-person" data-action="add-person" ${state.busy ? 'disabled' : ''}><span>${icon('plus')}</span> Add a person</button>${state.people.length ? `<button class="manage-people" data-action="manage-people">Manage squad</button>` : ''}</div></div>
          <div class="library-toolbar"><div class="filter-tabs" role="group" aria-label="Photo type">${[['all', 'All photos'], ['solo', 'Solo shots'], ['group', 'Together'], ['scenery', 'No faces'], ['unassigned', 'Needs a name']].map(([key, label]) => `<button data-action="filter" data-kind="${key}" class="filter-tab ${state.kind === key ? 'active' : ''}" aria-pressed="${state.kind === key}">${label}${key === 'solo' ? '<span class="new-dot"></span>' : ''}</button>`).join('')}${scoped.some(p => p.status === 'error') ? `<button class="filter-tab ${state.kind === 'errors' ? 'active' : ''}" data-action="filter" data-kind="errors">Errors</button>` : ''}</div><div class="filter-tools"><label class="search-field">${icon('search')}<input type="search" id="photo-search" placeholder="Search photos" value="${escape(state.query)}" aria-label="Search photos by filename"></label><select id="photo-sort" aria-label="Sort photos"><option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>Newest file date</option><option value="oldest" ${state.sort === 'oldest' ? 'selected' : ''}>Oldest file date</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>Filename A–Z</option><option value="people" ${state.sort === 'people' ? 'selected' : ''}>Fewest people</option></select></div></div>
          <div class="progress-panel ${state.busy ? '' : 'hidden'}" role="status"><span class="spinner"></span><div><strong id="progress-text">${escape(state.progress)}</strong><span>Keep this tab open while your photos are analyzed.</span></div><button class="text-button" data-action="cancel-import">${state.cancel ? 'Stopping…' : 'Stop after this photo'}</button></div>
          <div id="gallery-content"></div>
          <div class="library-footnote">${icon('shield')} Stored only in this browser <span>·</span> ${icon('person')} Solo = one detected face. Review hidden or missed people before exporting.</div>
        </section>
        <footer class="page-footer"><span>A place for every person. A home for every memory.</span><span>Made for your next adventure ${icon('mountain')}</span></footer>
      </main>
    </div>
    <input type="file" id="photo-input" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple hidden>
    <input type="file" id="folder-input" accept="image/*" webkitdirectory multiple hidden>
    <div class="drop-overlay hidden" id="drop-overlay">${icon('upload')}<h2>Bring your trip along.</h2><p>Drop your photos to add them to your library.</p></div>`;
  renderGallery();
}

function renderGallery() {
  const container = document.querySelector('#gallery-content'); if (!container) return;
  const photos = visible();
  if (!state.photos.length) {
    container.innerHTML = `<section class="empty-state" id="drop-zone"><div class="empty-art">${icon('image')}<span class="empty-art-bubble">${icon('plus')}</span></div><span class="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><h3>Big adventures. One easy upload.</h3><p>Drop your trip photos here, and let’s find your people.<br>All the memories, without all the manual sorting.</p><div class="empty-actions"><button class="button primary" data-action="import" ${state.busy ? 'disabled' : ''}>${icon('upload')} Choose photos</button><button class="button text" data-action="import-folder" ${state.busy ? 'disabled' : ''}>${icon('folder')} Add a folder</button></div><span class="file-types">JPG, PNG, WebP, AVIF & GIF <span>·</span> Your originals stay untouched</span></section><div class="how-it-works"><div><span class="step-number">01</span><div><strong>Bring your memories</strong><p>Add photos from one trip or all of them.</p></div></div><div><span class="step-number">02</span><div><strong>Meet your squad</strong><p>Name faces to group the right people.</p></div></div><div><span class="step-number">03</span><div><strong>Make it their album</strong><p>Filter solo shots. Export folders by person.</p></div></div></div>`;
    return;
  }
  container.innerHTML = `<div class="results-bar"><span><strong>${photos.length}</strong> photo${photos.length === 1 ? '' : 's'}${state.personId !== 'all' && state.kind === 'all' ? ' including this person' : ''}${state.kind === 'solo' ? ' with one detected or confirmed person' : ''}</span><div>${state.selected.size ? `<button class="text-button" data-action="clear-selection">Clear ${state.selected.size} selected</button><button class="button small primary" data-action="export">${icon('download')} Export selected</button>` : `<button class="text-button" data-action="select-all">Select visible</button>`}</div></div>${photos.length ? `<div class="photo-grid">${photos.map(photoCard).join('')}</div>` : `<div class="no-results">${icon('search')}<h3>No photos in this view</h3><p>Try a different person, photo type, or search.</p><button class="button secondary" data-action="reset-filters">Show all photos</button></div>`}`;
}

function photoCard(p) {
  const ids = photoPersonIds(p);
  const label = p.status === 'error' ? 'Analysis failed' : effectiveCount(p) === 0 ? 'No faces detected' : effectiveCount(p) === 1 ? 'Solo shot' : `${effectiveCount(p)} people`;
  return `<article class="photo-card ${state.selected.has(p.id) ? 'is-selected' : ''}"><div class="photo-image-wrap"><button class="photo-open" data-action="photo" data-id="${escape(p.id)}" aria-label="Review ${escape(p.name)}"><img src="${blobUrl(p.thumbnail || p.blob, 'photo-' + p.id)}" alt="${escape(p.name)}" loading="lazy"><span class="photo-hover">Review photo ${icon('arrow')}</span></button><button class="photo-select ${state.selected.has(p.id) ? 'checked' : ''}" data-action="select" data-id="${escape(p.id)}" aria-pressed="${state.selected.has(p.id)}" aria-label="Select ${escape(p.name)}">${icon('check')}</button><span class="photo-type ${p.status === 'error' ? 'type-error' : ''}">${icon(effectiveCount(p) === 1 ? 'person' : effectiveCount(p) > 1 ? 'people' : 'mountain')}${label}</span></div><div class="photo-caption"><strong title="${escape(p.name)}">${escape(p.name)}</strong><span>${ids.map(id => escape(personById(id)?.name || 'Unknown')).join(', ') || (p.faces?.length ? 'Tap to name faces' : 'A little piece of the journey')}${p.faces?.some(f => !f.personId) && ids.length ? ' · + unnamed' : ''}</span></div></article>`;
}

function addTripDialog() {
  openDialog(`${closeButton}<div class="modal-heading-icon">${icon('folder')}</div><h2>A new adventure</h2><p>Give this trip a name. You can import its photos next.</p><form id="trip-form"><label class="field-label">Trip name<input name="name" maxlength="80" placeholder="e.g. Summer in Japan" required autofocus></label><p class="form-error" role="alert"></p><button class="button primary full-width">Create trip ${icon('arrow')}</button></form>`);
}

function addPersonDialog() {
  if (state.people.length >= 16) { toast('This library supports up to 16 squad members.'); return; }
  openDialog(`${closeButton}<div class="modal-heading-icon">${icon('person')}</div><h2>Meet your travel buddy</h2><p>Add a clear photo with just their face. We’ll look for them across your trips.</p><form id="person-form"><label class="field-label">Name<input name="name" maxlength="60" placeholder="What do you call them?" required autofocus></label><label class="reference-upload">${icon('image')}<strong>Choose a reference portrait</strong><span>One person, facing the camera · JPG, PNG or WebP</span><input name="reference" type="file" accept="image/jpeg,image/png,image/webp" required></label><p class="form-error" role="alert"></p><button class="button primary full-width" ${state.busy ? 'disabled' : ''}>Add to my squad ${icon('plus')}</button><p class="modal-note">Or import your trip first, then name any detected face.</p></form>`);
}

function managePeople() {
  openDialog(`${closeButton}<h2>Your travel squad</h2><p>Keep names familiar. Add extra reference faces by confirming them in a photo.</p><div class="manage-people-list">${state.people.map(p => `<form class="rename-person" data-id="${escape(p.id)}"><img src="${blobUrl(p.thumbnail, 'person-' + p.id)}" alt=""><input name="name" value="${escape(p.name)}" maxlength="60" required aria-label="Name for ${escape(p.name)}"><button class="button secondary small">Save</button><button type="button" class="icon-button danger" data-action="remove-person" data-id="${escape(p.id)}" aria-label="Remove ${escape(p.name)}">${icon('trash')}</button></form>`).join('') || '<p>No one here yet. Add a reference portrait to start.</p>'}</div><p class="form-error" role="alert"></p><button class="button primary full-width" data-action="add-person">${icon('plus')} Add a person</button>`);
}

function showPhoto(id) {
  const photo = state.photos.find(p => p.id === id); if (!photo) return;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(photo.blob);
  openDialog(`${closeButton}<div class="photo-detail-image"><img src="${previewUrl}" alt="${escape(photo.name)}"></div><div class="photo-detail-content"><span class="eyebrow">A MOMENT FROM YOUR JOURNEY</span><h2>${escape(photo.name)}</h2><p>${photo.width || '?'} × ${photo.height || '?'} pixels ${photo.tripId ? ' · ' + escape(tripById(photo.tripId)?.name || 'Trip') : ''}</p>${photo.status === 'error' ? `<div class="error-banner">${escape(photo.error || 'Face analysis failed.')}<button class="text-button" data-action="retry-photo" data-id="${escape(id)}">Retry analysis</button></div>` : ''}<h3>Who’s in this memory?</h3><p class="detail-hint">Tap a face to name or correct it. Confirmed faces help improve future matches.</p><div class="detected-faces">${photo.faces.map((f, index) => `<button class="face-tile ${f.personId ? 'named' : ''}" data-action="identify" data-id="${escape(id)}" data-index="${index}"><img src="${blobUrl(f.thumbnail, `face-${id}-${index}`)}" alt="Detected face ${index + 1}"><strong>${escape(personById(f.personId)?.name || 'Who is this?')}</strong><span>${f.manual ? 'Confirmed by you' : f.personId ? 'Suggested match · review' : 'Tap to name'}</span></button>`).join('') || '<p class="no-faces-note">No faces were detected. Faces that are small, hidden, or turned away may be missed.</p>'}</div><form id="count-form" data-id="${escape(id)}" class="count-correction"><div><label for="people-count">Total people in this photo</label><p>Include anyone whose face wasn’t detected.</p></div><input id="people-count" name="count" type="number" min="0" max="500" step="1" value="${effectiveCount(photo)}" required><button class="button secondary small" ${state.busy ? 'disabled' : ''}>Save</button></form><div class="detail-actions"><button class="button secondary" data-action="download-one" data-id="${escape(id)}">${icon('download')} Export original</button><button class="text-button danger" data-action="delete-photo" data-id="${escape(id)}" ${state.busy ? 'disabled' : ''}>${icon('trash')} Remove from library</button></div><p class="form-error" role="alert"></p></div>`, 'photo-modal');
}

function identifyDialog(photoId, index) {
  const photo = state.photos.find(p => p.id === photoId), face = photo?.faces[index]; if (!face) return;
  openDialog(`${closeButton}<img class="identify-portrait" src="${blobUrl(face.thumbnail, `face-${photoId}-${index}`)}" alt="Face to identify"><h2>A familiar face?</h2><p>Choose someone in your squad, or give this person a name.</p><form id="identify-form" data-id="${escape(photoId)}" data-index="${index}"><label class="field-label">Person<select name="personId"><option value="new">+ Add a new person</option>${state.people.map(p => `<option value="${escape(p.id)}" ${face.personId === p.id ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}<option value="unknown">Leave unnamed / not in my squad</option></select></label><label class="field-label" id="new-name-field">New person’s name<input name="name" maxlength="60" placeholder="e.g. Alex"></label><p class="form-error" role="alert"></p><button class="button primary full-width">Confirm face ${icon('check')}</button><button type="button" class="button text full-width" data-action="photo" data-id="${escape(photoId)}">Back to photo</button></form>`);
  updateNewNameField();
}
function updateNewNameField() { const select = dialog.querySelector('[name=personId]'); const field = dialog.querySelector('#new-name-field'); if (field && select) { field.hidden = select.value !== 'new'; field.querySelector('input').required = select.value === 'new'; } }

async function reclassify() {
  for (const photo of state.photos) {
    if (photo.status === 'error') continue;
    photo.faces = reclassifyFaces(photo.faces, state.people);
    await savePhoto(photo);
  }
}

async function makeThumbnail(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const ratio = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not create thumbnail')), 'image/jpeg', 0.82));
}

async function importFiles(files) {
  if (state.busy || !files.length) return;
  const accepted = files.filter(f => /\.(jpe?g|png|webp|avif|gif)$/i.test(f.name));
  if (!accepted.length) { toast('Choose JPG, PNG, WebP, AVIF or GIF files. Convert HEIC/RAW photos first.'); return; }
  const importTrip = state.tripId === 'all' ? null : state.tripId;
  state.busy = true; state.cancel = false; state.error = ''; setProgress('Getting face recognition ready…'); render();
  let added = 0, duplicates = 0, failures = 0;
  try {
    if (!crypto.subtle) throw new Error('Open Roam using HTTPS or localhost to import photos securely.');
    await loadModels(setProgress);
    const existing = new Set(state.photos.map(p => p.checksum).filter(Boolean));
    for (let index = 0; index < accepted.length && !state.cancel; index++) {
      const file = accepted[index]; setProgress(`Photo ${index + 1} of ${accepted.length} · ${file.name}`);
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const checksum = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
      if (existing.has(checksum)) { duplicates++; continue; }
      let thumbnail;
      const photo = { id: uid(), name: file.name, blob: file, tripId: importTrip, checksum, addedAt: Date.now(), capturedAt: file.lastModified || Date.now(), faces: [], status: 'ready' };
      try {
        thumbnail = await makeThumbnail(file);
        const result = await analyzePhoto(file);
        Object.assign(photo, result, { thumbnail, faces: matchFaces(result.faces, state.people) });
      } catch (error) { failures++; Object.assign(photo, { thumbnail, status: 'error', error: error.message || 'Could not analyze this image.' }); }
      await savePhoto(photo); state.photos.push(photo); existing.add(checksum); added++; render();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    toast(`${added} photo${added === 1 ? '' : 's'} added${duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? '' : 's'} skipped` : ''}${failures ? ` · ${failures} need analysis review` : ''}${accepted.length < files.length ? ' · unsupported files skipped' : ''}${state.cancel ? ' · import stopped' : ''}.`);
  } catch (error) { state.error = `${error.message || error} You can try adding your photos again.`; }
  finally { state.busy = false; state.cancel = false; render(); }
}

async function exportView(onlyPhoto) {
  if (state.exportBusy) return;
  const photos = onlyPhoto ? [onlyPhoto] : state.selected.size ? state.photos.filter(p => state.selected.has(p.id)) : visible();
  if (!photos.length) { toast('No photos to export in this view.'); return; }
  state.exportBusy = true; render();
  try { await exportPhotos(photos, state.people, { groupByPerson: true }); toast(`Exported ${photos.length} original${photos.length === 1 ? '' : 's'} into organized folders.`); }
  catch (error) { toast(`Export failed: ${error.message || error}. Try fewer photos at a time.`); }
  finally { state.exportBusy = false; render(); }
}

function librarySettings() {
  openDialog(`${closeButton}<div class="modal-heading-icon">${icon('shield')}</div><h2>Your photos. Your space.</h2><p>Original photos, face matches, and names are saved only in this browser on this device. Nothing is sent to a photo service.</p><div class="storage-summary"><span>${state.photos.length} photos</span><span>${state.people.length} people</span><span>${(state.photos.reduce((n,p) => n + (p.blob?.size || 0), 0) / 1024 / 1024).toFixed(1)} MB of originals</span></div><p>Export your albums to keep a copy. Clearing browser storage or using private browsing can remove your library. Exported ZIPs contain originals and a file manifest; they do not contain face-recognition data.</p><p>Face matches are suggestions. Review them before sharing, and correct the people count for hidden or missed faces.</p><button class="button secondary full-width" data-action="export" ${!state.photos.length ? 'disabled' : ''}>${icon('download')} Export current view</button><div class="danger-zone"><strong>Clear this browser’s library</strong><p>Removes imported copies and face data from this browser. Your original files stay untouched.</p><button class="button danger-button" data-action="confirm-clear" ${state.busy ? 'disabled' : ''}>Clear library…</button></div>`);
}

root.addEventListener('input', event => { if (event.target.id === 'photo-search') { state.query = event.target.value; state.selected.clear(); renderGallery(); } });
root.addEventListener('change', event => {
  if (event.target.id === 'photo-sort') { state.sort = event.target.value; renderGallery(); }
  if (['photo-input', 'folder-input'].includes(event.target.id)) { const files = Array.from(event.target.files); event.target.value = ''; importFiles(files); }
});
dialog.addEventListener('change', event => { if (event.target.name === 'personId') updateNewNameField(); });

async function handleAction(event) {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  event.preventDefault(); const { action, id, kind, index } = button.dataset;
  try {
    if (action === 'close-dialog') closeDialog();
    if (action === 'menu') { state.mobile = !state.mobile; render(); }
    if (action === 'import') document.querySelector('#photo-input').click();
    if (action === 'import-folder') document.querySelector('#folder-input').click();
    if (action === 'cancel-import') { state.cancel = true; button.textContent = 'Stopping…'; }
    if (action === 'add-trip') addTripDialog();
    if (action === 'add-person' && !state.busy) addPersonDialog();
    if (action === 'manage-people') managePeople();
    if (action === 'about') librarySettings();
    if (action === 'reset-filters') { Object.assign(state, { tripId: 'all', personId: 'all', kind: 'all', query: '', mobile: false }); state.selected.clear(); render(); }
    if (action === 'trip') { Object.assign(state, { tripId: id, kind: 'all', query: '', personId: 'all', mobile: false }); state.selected.clear(); render(); }
    if (['filter', 'nav-kind'].includes(action)) { state.kind = kind; state.mobile = false; state.selected.clear(); render(); }
    if (action === 'person-filter') { state.personId = id; state.selected.clear(); render(); }
    if (action === 'photo') showPhoto(id);
    if (action === 'identify' && !state.busy) identifyDialog(id, Number(index));
    if (action === 'select') { state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); renderGallery(); }
    if (action === 'select-all') { visible().forEach(p => state.selected.add(p.id)); renderGallery(); }
    if (action === 'clear-selection') { state.selected.clear(); renderGallery(); }
    if (action === 'export') await exportView();
    if (action === 'download-one') await exportView(state.photos.find(p => p.id === id));
    if (action === 'delete-photo' && !state.busy) {
      openDialog(`${closeButton}<h2>Remove this photo?</h2><p>This removes its copy from Roam. The original on your device stays untouched.</p><div class="modal-button-row"><button class="button secondary" data-action="photo" data-id="${escape(id)}">Keep photo</button><button class="button danger-button" data-action="delete-photo-confirmed" data-id="${escape(id)}">Remove photo</button></div>`);
    }
    if (action === 'delete-photo-confirmed' && !state.busy) { await deletePhoto(id); state.photos = state.photos.filter(p => p.id !== id); state.selected.delete(id); closeDialog(); render(); toast('Photo removed from this library.'); }
    if (action === 'remove-person' && !state.busy) {
      openDialog(`${closeButton}<h2>Remove ${escape(personById(id)?.name)}?</h2><p>Their photos stay in your library, but their face labels and reference data will be removed.</p><div class="modal-button-row"><button class="button secondary" data-action="manage-people">Keep person</button><button class="button danger-button" data-action="remove-person-confirmed" data-id="${escape(id)}">Remove person</button></div>`);
    }
    if (action === 'remove-person-confirmed' && !state.busy) { await deletePerson(id); Object.assign(state, await getLibrary()); if (state.personId === id) state.personId = 'all'; render(); managePeople(); toast('Person and their face labels removed.'); }
    if (action === 'confirm-clear' && !state.busy) openDialog(`${closeButton}<h2>Clear your entire library?</h2><p>This removes all imported copies, trips, names, and face data from this browser. Export any albums you want to keep first. Original files on your device are untouched.</p><div class="modal-button-row"><button class="button secondary" data-action="about">Keep library</button><button class="button danger-button" data-action="clear-confirmed">Yes, clear library</button></div>`);
    if (action === 'clear-confirmed' && !state.busy) { await clearLibrary(); Object.assign(state, { photos: [], people: [], trips: [], tripId: 'all', personId: 'all', kind: 'all', query: '' }); state.selected.clear(); refreshUrls(); closeDialog(); render(); toast('This browser’s library has been cleared.'); }
    if (action === 'retry-photo' && !state.busy) {
      const photo = state.photos.find(p => p.id === id); button.disabled = true; button.textContent = 'Analyzing…'; state.busy = true;
      try {
        const result = await analyzePhoto(photo.blob); Object.assign(photo, result, { faces: matchFaces(result.faces, state.people), status: 'ready', error: null }); if (!photo.thumbnail) photo.thumbnail = await makeThumbnail(photo.blob); await savePhoto(photo); state.busy = false; showPhoto(id);
      } finally { state.busy = false; if (button.isConnected) { button.disabled = false; button.textContent = 'Retry analysis'; } render(); }
    }
  } catch (error) { dialog.open ? dialogError(error) : toast(error.message || String(error)); }
}
root.addEventListener('click', handleAction); dialog.addEventListener('click', handleAction);
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
dialog.addEventListener('close', () => { if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; } });

dialog.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target, data = new FormData(form); const submit = form.querySelector('button:not([type=button])');
  if (state.busy) { dialogError(new Error('Wait for the current import to finish.')); return; }
  if (submit) submit.disabled = true;
  try {
    if (form.id === 'trip-form') {
      const name = data.get('name').trim(); if (!name) throw new Error('Enter a trip name.');
      const trip = { id: uid(), name }; await saveTrip(trip); state.trips.push(trip); state.tripId = trip.id; state.personId = 'all'; state.kind = 'all'; state.selected.clear(); closeDialog(); render(); toast(`Trip created. Add photos to ${name}.`);
    }
    if (form.id === 'person-form') {
      if (state.people.length >= 16) throw new Error('This library supports up to 16 squad members.');
      state.busy = true;
      const name = data.get('name').trim(); if (!name) throw new Error('Enter a name.');
      const file = data.get('reference'); if (!file?.size) throw new Error('Choose a reference portrait.');
      submit.textContent = 'Finding their face…';
      const result = await analyzePhoto(file);
      if (result.faces.length !== 1) throw new Error(result.faces.length ? 'More than one face found. Choose a photo with only this person.' : 'No face found. Try a clearer, front-facing portrait.');
      const face = result.faces[0]; const person = { id: uid(), name, thumbnail: face.thumbnail, descriptors: [Array.from(face.descriptor)] };
      await savePerson(person); state.people.push(person); await reclassify(); closeDialog(); render(); toast(`${name} is in your squad. Existing photos have been matched.`);
    }
    if (form.id === 'identify-form') {
      state.busy = true;
      const photo = state.photos.find(p => p.id === form.dataset.id), face = photo.faces[Number(form.dataset.index)];
      let personId = data.get('personId');
      if (personId === 'new') {
        if (state.people.length >= 16) throw new Error('This library supports up to 16 squad members.');
        const name = data.get('name').trim(); if (!name) throw new Error('Give this person a name.');
        const person = { id: uid(), name, thumbnail: face.thumbnail, descriptors: [Array.from(face.descriptor)] }; await savePerson(person); state.people.push(person); personId = person.id;
      } else if (personId !== 'unknown') {
        const person = personById(personId); if (!person) throw new Error('Person no longer exists.');
        if (photo.faces.some((f, i) => i !== Number(form.dataset.index) && f.personId === personId)) throw new Error('This person is already assigned to another face in this photo. Correct that face first.');
        person.descriptors = [...person.descriptors, Array.from(face.descriptor)].slice(-8); await savePerson(person);
      }
      Object.assign(face, { personId: personId === 'unknown' ? null : personId, manual: true, distance: null }); await savePhoto(photo); await reclassify(); state.busy = false; render(); showPhoto(photo.id); toast('Face confirmed. Your library has been regrouped.');
    }
    if (form.id === 'count-form') {
      const count = Number(data.get('count')); if (!Number.isInteger(count) || count < 0 || count > 500) throw new Error('Enter a whole number from 0 to 500.');
      const photo = state.photos.find(p => p.id === form.dataset.id); photo.personCountOverride = count; await savePhoto(photo); render(); toast('People count updated. Solo and group filters now use your count.');
    }
    if (form.classList.contains('rename-person')) {
      const name = data.get('name').trim(); if (!name) throw new Error('Enter a name.'); const person = personById(form.dataset.id); person.name = name; await savePerson(person); render(); managePeople(); toast('Name updated.');
    }
  } catch (error) { dialogError(error); }
  finally {
    state.busy = false;
    render();
    if (submit?.isConnected) { submit.disabled = false; if (form.id === 'person-form') submit.innerHTML = `Add to my squad ${icon('plus')}`; }
  }
});

let dragDepth = 0;
document.addEventListener('dragenter', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); dragDepth++; document.querySelector('#drop-overlay')?.classList.remove('hidden'); } });
document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
document.addEventListener('dragleave', event => { if (event.dataTransfer?.types.includes('Files') && --dragDepth <= 0) { dragDepth = 0; document.querySelector('#drop-overlay')?.classList.add('hidden'); } });
document.addEventListener('drop', event => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); dragDepth = 0; document.querySelector('#drop-overlay')?.classList.add('hidden'); importFiles(Array.from(event.dataTransfer.files)); });

render();
try { Object.assign(state, await getLibrary()); render(); }
catch { state.error = 'Browser storage is unavailable. Allow site storage or use a regular browser window to keep your library.'; render(); }
