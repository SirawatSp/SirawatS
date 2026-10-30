import test from 'node:test';
import assert from 'node:assert/strict';
import { reclassifyFaces } from '../src/matching.js';

const people = [
  { id: 'alex', descriptors: [[0, 0]] },
  { id: 'sam', descriptors: [[0.3, 0]] },
];
const face = (x, extras = {}) => ({ descriptor: [x, 0], ...extras });

test('manual corrections reserve the person and cannot be duplicated by automatic matching', () => {
  const faces = [face(0.25, { personId: 'alex', manual: true }), face(0.01)];
  const result = reclassifyFaces(faces, people);
  assert.deepEqual(result.map((item) => item.personId), ['alex', 'sam']);
  assert.equal(result[0].distance, null);
  assert.equal(result[0].manual, true);
  assert.equal(faces[1].personId, undefined, 'input faces remain unchanged');
});

test('explicitly unnamed faces remain unnamed even when a new reference is an exact match', () => {
  const result = reclassifyFaces([
    face(0, { personId: null, manual: true }),
    face(0.05),
  ], people);
  assert.deepEqual(result.map((item) => item.personId), [null, 'alex']);
  assert.equal(result[0].manual, true);
});

test('new reference photos update suggestions without overriding confirmed identities', () => {
  const faces = [face(0, { personId: 'sam', manual: true }), face(1, { personId: null })];
  const updatedPeople = [
    { id: 'alex', descriptors: [[0, 0], [1, 0]] },
    { id: 'sam', descriptors: [[0.3, 0]] },
  ];
  assert.deepEqual(reclassifyFaces(faces, people).map((item) => item.personId), ['sam', null]);
  assert.deepEqual(reclassifyFaces(faces, updatedPeople).map((item) => item.personId), ['sam', 'alex']);
});

test('automatic faces still receive distinct identities around manually unnamed faces', () => {
  const result = reclassifyFaces([
    face(0.1),
    face(0.3, { personId: null, manual: true }),
    face(-0.25),
  ], people);
  assert.deepEqual(result.map((item) => item.personId), ['sam', null, 'alex']);
});

test('removing a person clears their confirmed label without guessing a replacement', () => {
  const result = reclassifyFaces([
    face(0, { personId: 'removed', manual: true, distance: 0.1 }),
    face(0),
  ], people);
  assert.deepEqual(result.map((item) => item.personId), [null, 'alex']);
  assert.equal(result[0].manual, true);
  assert.equal(result[0].distance, null);
});

test('empty photo face lists and an empty squad are safe', () => {
  assert.deepEqual(reclassifyFaces([], people), []);
  assert.deepEqual(reclassifyFaces([face(0)], []).map((item) => item.personId), [null]);
});
