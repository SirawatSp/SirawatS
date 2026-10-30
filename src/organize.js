const facesOf = photo => Array.isArray(photo.faces) ? photo.faces : [];
const isAssigned = face => face?.personId !== undefined && face.personId !== null && face.personId !== '';
const isReady = photo => photo.status === undefined || photo.status === 'ready';
const hasUnknownFace = photo => facesOf(photo).some(face => !isAssigned(face));
const photoName = photo => String(photo.name ?? photo.filename ?? '');

export function effectiveCount(photo) {
  return Number.isInteger(photo.personCountOverride) && photo.personCountOverride >= 0 ? photo.personCountOverride : facesOf(photo).length;
}

export function photoPersonIds(photo) {
  return [...new Set(facesOf(photo).filter(isAssigned).map(face => face.personId))];
}

function timestamp(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const number = Number(value);
  if (Number.isFinite(number)) return number;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
const photoTime = photo => timestamp(photo.capturedAt) ?? timestamp(photo.addedAt) ?? 0;

export function filterPhotos(photos, {tripId = 'all', personId = 'all', kind = 'all', query = '', sort = 'newest'} = {}) {
  const search = String(query).trim().toLocaleLowerCase();
  return photos.filter(photo => {
    if (tripId !== 'all' && photo.tripId !== tripId) return false;
    if (personId !== 'all' && !photoPersonIds(photo).includes(personId)) return false;
    if (search && !photoName(photo).toLocaleLowerCase().includes(search)) return false;
    if (kind === 'all') return true;
    if (kind === 'errors') return photo.status === 'error';
    if (!isReady(photo)) return false;
    const count = effectiveCount(photo);
    if (kind === 'solo') return count === 1;
    if (kind === 'group') return count > 1;
    if (kind === 'unassigned') return hasUnknownFace(photo);
    if (kind === 'scenery') return count === 0;
    return true;
  }).sort((a, b) => sort === 'name' ? photoName(a).localeCompare(photoName(b)) : sort === 'people' ? effectiveCount(a) - effectiveCount(b) : sort === 'oldest' ? photoTime(a) - photoTime(b) : photoTime(b) - photoTime(a));
}

export function getStats(photos) {
  const stats = {total: photos.length, solo: 0, group: 0, unassigned: 0, scenery: 0};
  for (const photo of photos) {
    if (!isReady(photo)) continue;
    const count = effectiveCount(photo);
    if (count === 1) stats.solo++;
    else if (count > 1) stats.group++;
    else stats.scenery++;
    if (hasUnknownFace(photo)) stats.unassigned++;
  }
  return stats;
}
