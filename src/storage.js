// Photos and face descriptors stay in this browser's IndexedDB database.
const DATABASE = 'trip-photo-organizer';
const VERSION = 1;
const STORES = ['photos', 'people', 'trips'];
let databasePromise;

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error('This browser does not support local photo storage. Try a current Chrome, Firefox, or Safari browser.'));
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of STORES) {
          if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath: 'id' });
        }
      };
      request.onerror = () => reject(request.error || new Error('Unable to open local photo storage.'));
      request.onblocked = () => reject(new Error('Photo storage is open in an older tab. Close other tabs for this app and try again.'));
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); databasePromise = undefined; };
        database.onclose = () => { databasePromise = undefined; };
        resolve(database);
      };
    }).catch((error) => { databasePromise = undefined; throw error; });
  }
  return databasePromise;
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('The local storage operation was cancelled.'));
    transaction.onerror = () => {
      // onabort delivers the final transaction error; it also covers quota errors.
    };
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to read local photo storage.'));
  });
}

function validateRecord(record) {
  if (!record || typeof record.id !== 'string' || !record.id.trim()) {
    throw new TypeError('Saved records need a nonempty string id.');
  }
}

async function put(storeName, record) {
  validateRecord(record);
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const completed = transactionComplete(transaction);
  try {
    transaction.objectStore(storeName).put(record);
  } catch (error) {
    transaction.abort();
    await completed.catch(() => {});
    throw error;
  }
  await completed;
  return record;
}

async function remove(storeName, id) {
  validateRecord({ id });
  const database = await openDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore(storeName).delete(id);
  await completed;
}

export async function getLibrary() {
  const database = await openDatabase();
  const transaction = database.transaction(STORES, 'readonly');
  const completed = transactionComplete(transaction);
  const requests = STORES.map((store) => requestResult(transaction.objectStore(store).getAll()));
  const [photos, people, trips] = await Promise.all([...requests, completed]);
  return { photos, people, trips };
}

export const savePhoto = (photo) => put('photos', photo);
export const savePerson = (person) => put('people', person);
export const saveTrip = (trip) => put('trips', trip);
export const deletePhoto = (id) => remove('photos', id);

export async function deletePerson(id) {
  validateRecord({ id });
  const database = await openDatabase();
  const transaction = database.transaction(['people', 'photos'], 'readwrite');
  const completed = transactionComplete(transaction);
  transaction.objectStore('people').delete(id);
  const photos = transaction.objectStore('photos');
  const request = photos.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const photo = cursor.value;
    if (photo.faces?.some((face) => face.personId === id)) {
      cursor.update({ ...photo, faces: photo.faces.map((face) => face.personId === id ? { ...face, personId: null, distance: null, manual: false } : face) });
    }
    cursor.continue();
  };
  await completed;
}

export async function clearLibrary() {
  const database = await openDatabase();
  const transaction = database.transaction(STORES, 'readwrite');
  const completed = transactionComplete(transaction);
  for (const store of STORES) transaction.objectStore(store).clear();
  await completed;
}
