import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveCount, filterPhotos, getStats, photoPersonIds} from '../src/organize.js';

const photos = [
  {id:'a',name:'sunset.jpg',tripId:'coast',faces:[{personId:'alex'}],capturedAt:2},
  {id:'b',name:'group.jpg',tripId:'coast',faces:[{personId:'alex'},{}],capturedAt:1},
  {id:'c',name:'trees.jpg',tripId:'city',faces:[],capturedAt:null,addedAt:3},
  {id:'d',name:'hidden.jpg',tripId:'coast',faces:[{personId:'alex'}],personCountOverride:2,capturedAt:4},
  {id:'e',name:'broken.jpg',faces:[],status:'error'},
];
const ids = list => list.map(p => p.id);
test('manual people counts override face counts, with invalid values ignored', () => {
  assert.equal(effectiveCount({faces:[{}],personCountOverride:0}),0);
  for (const v of [null,undefined,-1,1.5,NaN,'2']) assert.equal(effectiveCount({faces:[{}],personCountOverride:v}),1);
  assert.equal(effectiveCount({}),0);
});
test('person identities are unique and unknowns excluded', () => assert.deepEqual(photoPersonIds({faces:[{personId:'a'},{},{personId:null},{personId:'a'},{personId:'b'}]}),['a','b']));
test('trip, person, type and filename filters intersect', () => assert.deepEqual(ids(filterPhotos(photos,{tripId:'coast',personId:'alex',kind:'solo',query:' SUNSET '})),['a']));
test('hidden people exclude a detected solo face from solo views', () => { assert.deepEqual(ids(filterPhotos(photos,{kind:'solo'})),['a']); assert.deepEqual(ids(filterPhotos(photos,{kind:'group'})),['d','b']); });
test('errors never count as scenery and unknown faces need a name', () => { assert.deepEqual(ids(filterPhotos(photos,{kind:'scenery'})),['c']); assert.deepEqual(ids(filterPhotos(photos,{kind:'unassigned'})),['b']); assert.deepEqual(ids(filterPhotos(photos,{kind:'errors'})),['e']); assert.deepEqual(getStats(photos),{total:5,solo:1,group:2,unassigned:1,scenery:1}); });
test('sorts dates using addedAt fallback without changing the source', () => { assert.deepEqual(ids(filterPhotos(photos)),['d','c','a','b','e']); assert.deepEqual(ids(filterPhotos(photos,{sort:'oldest'})),['e','b','a','c','d']); assert.deepEqual(ids(photos),['a','b','c','d','e']); });
test('sorts names and people counts ascending', () => { assert.deepEqual(ids(filterPhotos(photos,{sort:'name'})),['e','b','d','a','c']); assert.equal(filterPhotos(photos,{sort:'people'})[0].id,'c'); });
