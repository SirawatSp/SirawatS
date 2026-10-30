import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildPhotoArchive, safeName } from '../src/export.js';

const people = [{ id: 'mai', name: 'Mai' }, { id: 'noon', name: 'Noon' }];
const photo = (id, faces = [], extra = {}) => ({ id, name: `${id}.jpg`, blob: new Blob([`original ${id}`], { type: 'image/jpeg' }), faces, status: 'ready', ...extra });
async function unzip(photos, squad = people, options) {
  const result = await buildPhotoArchive(photos, squad, options);
  return JSZip.loadAsync(await result.blob.arrayBuffer());
}

test('exports original bytes into single-person, group, unassigned, and no-face folders', async () => {
  const zip = await unzip([
    photo('solo', [{ personId: 'mai' }]),
    photo('group', [{ personId: 'mai' }, { personId: 'noon' }]),
    photo('unknown', [{ personId: null }]),
    photo('landscape'),
  ]);
  assert.equal(await zip.file('Mai/solo.jpg').async('string'), 'original solo');
  assert.ok(zip.file('Groups/group.jpg'));
  assert.ok(zip.file('Unassigned/unknown.jpg'));
  assert.ok(zip.file('No faces/landscape.jpg'));
});

test('manual visible-person count prevents missed faces from becoming solo exports', async () => {
  const zip = await unzip([
    photo('hidden-person', [{ personId: 'mai' }], { personCountOverride: 2 }),
    photo('no-detection', [], { personCountOverride: 1 }),
    photo('false-positive', [{ personId: 'mai' }], { personCountOverride: 0 }),
  ]);
  assert.ok(zip.file('Groups/hidden-person.jpg'));
  assert.ok(zip.file('Unassigned/no-detection.jpg'));
  assert.ok(zip.file('No faces/false-positive.jpg'));
});

test('unknown or deleted squad ids never create named-person folders', async () => {
  const zip = await unzip([photo('stale', [{ personId: 'deleted-person' }])]);
  assert.ok(zip.file('Unassigned/stale.jpg'));
});

test('case-insensitive duplicate filenames and squad names keep every original', async () => {
  const zip = await unzip([
    photo('a', [{ personId: '1' }], { name: 'IMG.jpg' }),
    photo('b', [{ personId: '1' }], { name: 'img.JPG' }),
    photo('c', [{ personId: '2' }], { name: 'IMG.jpg' }),
  ], [{ id: '1', name: 'Mai' }, { id: '2', name: 'mai' }]);
  assert.equal(await zip.file('Mai/IMG.jpg').async('string'), 'original a');
  assert.equal(await zip.file('Mai/img (2).JPG').async('string'), 'original b');
  assert.equal(await zip.file('mai (2)/IMG.jpg').async('string'), 'original c');
});

test('safe filenames preserve Unicode and prevent directory traversal and reserved names', async () => {
  assert.equal(safeName(' ทริปเชียงใหม่.jpg '), 'ทริปเชียงใหม่.jpg');
  assert.equal(safeName('../../photo.jpg'), '_.._photo.jpg');
  assert.equal(safeName('CON.jpg'), '_CON.jpg');
  const zip = await unzip([photo('a', [{ personId: 'a' }], { name: '../../photo.jpg' })], [{ id: 'a', name: '../Squad' }]);
  const entries = Object.keys(zip.files);
  assert.ok(entries.includes('_Squad/_.._photo.jpg'));
  assert.ok(entries.every((entry) => !entry.split('/').includes('..')));
});

test('flat export avoids manifest collisions and excludes biometric descriptors', async () => {
  const zip = await unzip([photo('a', [{ personId: 'mai', descriptor: [0.1, 0.2] }], { name: 'manifest.json' })], people, { groupByPerson: false });
  assert.ok(zip.file('manifest (2).json'));
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  assert.equal(manifest.photos[0].path, 'manifest (2).json');
  assert.deepEqual(manifest.photos[0].people, ['Mai']);
  assert.equal(JSON.stringify(manifest).includes('descriptor'), false);
});

test('empty selections and unavailable originals fail instead of producing incomplete archives', async () => {
  await assert.rejects(buildPhotoArchive([], []), /Choose some photos/);
  await assert.rejects(buildPhotoArchive([{ id: 'missing', name: 'missing.jpg' }], []), /original.*unavailable/);
});
