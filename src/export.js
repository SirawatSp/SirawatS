import JSZip from 'jszip';

// Keep Unicode names readable while making each ZIP entry safe to extract on
// Windows, macOS, and Linux. User-provided names never become directory paths.
export function safeName(value, fallback = 'Untitled') {
  let name = String(value || '').normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_')
    .replace(/\s+/g, ' ').trim().replace(/^[. ]+|[. ]+$/g, '');
  if (!name) name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return [...name].slice(0, 160).join('');
}

function uniqueName(name, used) {
  const normalized = (value) => value.normalize('NFC').toLocaleLowerCase('en-US');
  let result = name;
  let number = 2;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  while (used.has(normalized(result))) result = `${stem} (${number++})${extension}`;
  used.add(normalized(result));
  return result;
}

function makeFolders(people) {
  const used = new Set(['groups', 'unassigned', 'no faces']);
  return new Map(people.map((person) => [person.id, uniqueName(safeName(person.name, 'Person'), used)]));
}

export function photoFolder(photo, folders) {
  if (photo.status === 'error') return 'Unassigned';
  const faces = photo.faces || [];
  const count = photo.personCountOverride ?? faces.length;
  if (count === 0) return 'No faces';
  if (count > 1) return 'Groups';
  const assigned = faces.filter((face) => folders.has(face.personId));
  return assigned.length === 1 ? folders.get(assigned[0].personId) : 'Unassigned';
}

/** Build an archive without DOM side effects, useful for testing and integrations. */
export async function buildPhotoArchive(photos, people, { groupByPerson = true } = {}) {
  if (!photos.length) throw new Error('Choose some photos to export first.');
  const zip = new JSZip();
  const folders = makeFolders(people);
  const usedByFolder = new Map();
  const manifest = [];
  const names = new Map(people.map((person) => [person.id, person.name]));
  // Reserve our metadata filename when exporting a flat folder.
  usedByFolder.set('', new Set(['manifest.json']));
  for (const photo of photos) {
    if (!(photo.blob instanceof Blob)) throw new Error(`The original for ${photo.name || 'a photo'} is unavailable. Re-import it before exporting.`);
    const folder = groupByPerson ? photoFolder(photo, folders) : '';
    if (!usedByFolder.has(folder)) usedByFolder.set(folder, new Set());
    const filename = uniqueName(safeName(photo.name, 'photo'), usedByFolder.get(folder));
    const path = folder ? `${folder}/${filename}` : filename;
    zip.file(path, await photo.blob.arrayBuffer());
    manifest.push({
      id: photo.id, originalName: photo.name, path, tripId: photo.tripId || null,
      faceCount: photo.faces?.length || 0,
      visiblePeople: photo.personCountOverride ?? photo.faces?.length ?? 0,
      people: [...new Set((photo.faces || []).map((face) => names.get(face.personId)).filter(Boolean))],
      capturedAt: photo.capturedAt || null,
    });
  }
  zip.file('manifest.json', JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), photos: manifest }, null, 2));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  return { blob, count: photos.length, filename: `trip-photos-${new Date().toISOString().slice(0, 10)}.zip` };
}

/** Download original photo files; grouping never moves or changes the originals. */
export async function exportPhotos(photos, people, options = {}) {
  const result = await buildPhotoArchive(photos, people, options);
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Leave enough time for browser download handlers to consume the Blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return result;
}
