import { matchFaces } from './face-engine.js';

/** Re-match suggestions while keeping the user's explicit decisions authoritative. */
export function reclassifyFaces(faces, people) {
  const validPeople = new Set(people.map((person) => person.id));
  const reserved = new Set();
  for (const face of faces) {
    if (face.manual && validPeople.has(face.personId)) reserved.add(face.personId);
  }
  const suggestions = matchFaces(
    faces.filter((face) => !face.manual),
    people.filter((person) => !reserved.has(person.id)),
  );
  let suggestionIndex = 0;
  return faces.map((face) => face.manual ? {
    ...face,
    personId: validPeople.has(face.personId) ? face.personId : null,
    distance: null,
  } : suggestions[suggestionIndex++]);
}
