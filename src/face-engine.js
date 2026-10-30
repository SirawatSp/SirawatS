let modelPromise;
let api;

/** Load only local face detection, landmark and identity models. Photos never leave the browser. */
export async function loadModels(onProgress = () => {}) {
  if (!modelPromise) {
    modelPromise = (async () => {
      onProgress('Preparing face recognition…');
      api = await import('@vladmandic/face-api/dist/face-api.esm.js');
      try {
        const available = await api.tf.setBackend('webgl');
        if (!available) throw new Error('WebGL unavailable');
        await api.tf.ready();
      } catch {
        await api.tf.setBackend('cpu');
        await api.tf.ready();
      }
      const modelPath = `${import.meta.env?.BASE_URL || '/'}models`;
      for (const [network, label] of [
        [api.nets.ssdMobilenetv1, 'Finding faces'],
        [api.nets.faceLandmark68Net, 'Reading facial landmarks'],
        [api.nets.faceRecognitionNet, 'Preparing face matching'],
      ]) {
        onProgress(`${label}…`);
        await network.loadFromUri(modelPath);
      }
      onProgress('Face recognition ready');
      return true;
    })().catch((error) => {
      modelPromise = undefined;
      throw new Error(`Could not load local face recognition. Run npm run models and reload the page. ${error.message}`);
    });
  }
  return modelPromise;
}

async function decodeImage(blob) {
  if (!(blob instanceof Blob)) throw new Error('Choose an image file to analyze.');
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers support additional formats through HTMLImageElement.
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new Error('This image could not be read. Try a JPEG, PNG or WebP version (HEIC and RAW may need conversion).');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function asBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not create a face preview.')),
    'image/jpeg', 0.88,
  ));
}

/** Return descriptors and normalized bounding boxes in the EXIF-oriented image. */
export async function analyzePhoto(blob) {
  await loadModels();
  const image = await decodeImage(blob);
  let canvas;
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('This image has no readable dimensions.');
    const scale = Math.min(1, 1600 / Math.max(width, height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Your browser cannot create an image canvas.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const detected = await api.detectAllFaces(canvas, new api.SsdMobilenetv1Options({
      minConfidence: 0.5,
      maxResults: 100,
    })).withFaceLandmarks().withFaceDescriptors();
    const faces = [];
    for (const result of detected) {
      const raw = result.detection.box;
      const x = Math.max(0, raw.x);
      const y = Math.max(0, raw.y);
      const w = Math.max(1, Math.min(raw.width, canvas.width - x));
      const h = Math.max(1, Math.min(raw.height, canvas.height - y));
      const padding = Math.max(w, h) * 0.18;
      const left = Math.max(0, x - padding);
      const top = Math.max(0, y - padding);
      const cropWidth = Math.min(canvas.width - left, w + padding * 2);
      const cropHeight = Math.min(canvas.height - top, h + padding * 2);
      const thumbnail = document.createElement('canvas');
      thumbnail.width = 144;
      thumbnail.height = 144;
      const crop = thumbnail.getContext('2d');
      crop.drawImage(canvas, left, top, cropWidth, cropHeight, 0, 0, 144, 144);
      const preview = await asBlob(thumbnail);
      thumbnail.width = thumbnail.height = 0;
      faces.push({
        descriptor: Array.from(result.descriptor),
        box: { x: x / canvas.width, y: y / canvas.height, width: w / canvas.width, height: h / canvas.height },
        thumbnail: preview,
        score: result.detection.score,
      });
    }
    return { faces, width, height };
  } catch (error) {
    throw new Error(`Could not analyze this photo. ${error.message}`);
  } finally {
    image.close?.();
    if (canvas) canvas.width = canvas.height = 0;
  }
}

function euclidean(a, b) {
  if (!a?.length || a.length !== b?.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return Infinity;
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Match known squad members conservatively, with one distinct person per face.
 * Optimize the number of confident matches, then total descriptor distance.
 * Reference sets over 16 people are unsupported by this small-squad matcher.
 */
export function matchFaces(faces, people, threshold = 0.5) {
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Face threshold must be a positive number.');
  if (people.length > 16) throw new Error('Use at most 16 people in one squad.');
  if (new Set(people.map((person) => person.id)).size !== people.length) throw new Error('Each person needs a unique ID.');
  const distances = faces.map((face) => people.map((person) => Math.min(
    Infinity, ...(person.descriptors || []).map((sample) => euclidean(face.descriptor, sample)),
  )));
  let states = new Map([[0, { cost: 0, assignments: [] }]]);
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    const next = new Map();
    const keep = (mask, state) => {
      if (!next.has(mask) || state.cost < next.get(mask).cost) next.set(mask, state);
    };
    for (const [mask, state] of states) {
      keep(mask, { cost: state.cost, assignments: [...state.assignments, null] });
      for (let personIndex = 0; personIndex < people.length; personIndex++) {
        const distance = distances[faceIndex][personIndex];
        if ((mask & (1 << personIndex)) || distance > threshold) continue;
        keep(mask | (1 << personIndex), {
          cost: state.cost + distance,
          assignments: [...state.assignments, personIndex],
        });
      }
    }
    states = next;
  }
  let best = { count: -1, cost: Infinity, assignments: [] };
  for (const [mask, state] of states) {
    let bits = mask;
    let count = 0;
    while (bits) { count += bits & 1; bits >>>= 1; }
    if (count > best.count || (count === best.count && state.cost < best.cost)) best = { ...state, count };
  }
  return faces.map((face, index) => {
    const personIndex = best.assignments[index];
    return {
      ...face,
      personId: personIndex == null ? null : people[personIndex].id,
      distance: personIndex == null ? null : distances[index][personIndex],
    };
  });
}
