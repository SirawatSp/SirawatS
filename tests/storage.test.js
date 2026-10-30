import 'fake-indexeddb/auto';
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearLibrary, deletePerson, deletePhoto, getLibrary, savePerson, savePhoto, saveTrip } from '../src/storage.js';

beforeEach(async () => clearLibrary());

test('an empty library has all three collections', async () => {
  assert.deepEqual(await getLibrary(), { photos: [], people: [], trips: [] });
});

test('persists original photo blobs, face descriptors, and trip records', async () => {
  await saveTrip({ id: 'trip-1', name: 'Chiang Mai' });
  await savePerson({ id: 'person-1', name: 'Mai', descriptors: [[0.1, 0.2]], thumbnail: new Blob(['portrait']) });
  await savePhoto({ id: 'photo-1', name: 'IMG_001.jpg', tripId: 'trip-1', blob: new Blob(['original photo'], { type: 'image/jpeg' }), faces: [{ personId: 'person-1', descriptor: [0.1, 0.2] }], personCountOverride: 2 });
  const result = await getLibrary();
  assert.equal(await result.photos[0].blob.text(), 'original photo');
  assert.equal(result.photos[0].blob.type, 'image/jpeg');
  assert.equal(result.photos[0].personCountOverride, 2);
  assert.deepEqual(result.photos[0].faces[0].descriptor, [0.1, 0.2]);
  assert.deepEqual(result.people[0].descriptors, [[0.1, 0.2]]);
  assert.equal(await result.people[0].thumbnail.text(), 'portrait');
  assert.equal(result.trips[0].name, 'Chiang Mai');
});

test('updating a photo replaces its record without creating duplicates', async () => {
  await savePhoto({ id: 'photo-1', name: 'first.jpg', faces: [] });
  await savePhoto({ id: 'photo-1', name: 'updated.jpg', faces: [] });
  const library = await getLibrary();
  assert.equal(library.photos.length, 1);
  assert.equal(library.photos[0].name, 'updated.jpg');
});

test('removing a person clears only their photo assignments atomically', async () => {
  await savePerson({ id: 'a', name: 'A', descriptors: [] });
  await savePerson({ id: 'b', name: 'B', descriptors: [] });
  await savePhoto({ id: 'p', faces: [{ personId: 'a', distance: 0.2, descriptor: [1], manual: true }, { personId: 'b', distance: 0.3, descriptor: [2] }] });
  await deletePerson('a');
  const library = await getLibrary();
  assert.deepEqual(library.people.map((person) => person.id), ['b']);
  assert.deepEqual(library.photos[0].faces, [{ personId: null, distance: null, descriptor: [1], manual: false }, { personId: 'b', distance: 0.3, descriptor: [2] }]);
});

test('deleting a photo preserves the other records', async () => {
  await savePhoto({ id: 'one', name: 'one.jpg' });
  await savePhoto({ id: 'two', name: 'two.jpg' });
  await saveTrip({ id: 'trip', name: 'Trip' });
  await deletePhoto('one');
  const library = await getLibrary();
  assert.deepEqual(library.photos.map((photo) => photo.id), ['two']);
  assert.equal(library.trips.length, 1);
});

test('rejects records with invalid identities before writing', async () => {
  await assert.rejects(savePhoto({ name: 'bad.jpg' }), /nonempty string id/);
  await assert.rejects(deletePhoto(undefined), /nonempty string id/);
  assert.deepEqual((await getLibrary()).photos, []);
});
