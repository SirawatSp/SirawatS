import test from 'node:test';
import assert from 'node:assert/strict';
import { matchFaces } from '../src/face-engine.js';

const face = (x) => ({ descriptor: [x, 0], box: { x: 0, y: 0, width: 0.1, height: 0.1 } });

test('matches known people and preserves unknown faces rather than forcing a squad label', () => {
  const faces = [face(0.05), face(1.1), face(4)];
  const people = [{ id: 'a', descriptors: [[0, 0]] }, { id: 'b', descriptors: [[1, 0]] }];
  const result = matchFaces(faces, people);
  assert.deepEqual(result.map((item) => item.personId), ['a', 'b', null]);
  assert.equal(result[2].distance, null);
  assert.equal(result[0].box, faces[0].box);
  assert.equal(faces[0].personId, undefined, 'does not mutate stored source faces');
});

test('finds a distinct assignment instead of greedily assigning the same person twice', () => {
  const people = [{ id: 'a', descriptors: [[0, 0]] }, { id: 'b', descriptors: [[0.3, 0]] }];
  assert.deepEqual(matchFaces([face(0.1), face(-0.2)], people, 0.4).map((item) => item.personId), ['b', 'a']);
});

test('leaves duplicate face unmatched when only one known reference can match', () => {
  const result = matchFaces([face(0.01), face(0.1)], [{ id: 'a', descriptors: [[0, 0]] }]);
  assert.deepEqual(result.map((item) => item.personId), ['a', null]);
});

test('uses multiple reference photos and ignores malformed descriptors', () => {
  const people = [{ id: 'a', descriptors: [[0, 0], [2, 0], [NaN, 0]] }, { id: 'b', descriptors: [[2]] }];
  assert.equal(matchFaces([face(2.1)], people)[0].personId, 'a');
  assert.equal(matchFaces([face(0)], [{ id: 'x', descriptors: [[NaN, 0]] }])[0].personId, null);
});

test('empty squads and no detected faces are supported', () => {
  assert.deepEqual(matchFaces([], []), []);
  assert.equal(matchFaces([face(0)], [])[0].personId, null);
});

test('rejects invalid thresholds and duplicate person IDs', () => {
  assert.throws(() => matchFaces([], [], NaN), /threshold/);
  assert.throws(() => matchFaces([], [{ id: 'a' }, { id: 'a' }]), /unique ID/);
});
