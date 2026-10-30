#!/usr/bin/env node
// The pinned npm package includes these model files. npm verifies the package's
// lockfile integrity; fixed SHA256 hashes also verify every copied model asset.
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/@vladmandic/face-api');
const destination = resolve(root, 'public/models');
const files = {
  'ssd_mobilenetv1_model-weights_manifest.json': '888f744dffbc84f5f060d1f8427d9742341943a2dfaaf9205d10029b7e7a2955',
  'ssd_mobilenetv1_model.bin': '2835640602d53718aa6ae9a42896327eaa21beefed056c218d32ca7d79e1e2f8',
  'face_landmark_68_model-weights_manifest.json': 'ca4886639f86e99b39fed0c155f81b63317225773bd9616716e887b0153389c9',
  'face_landmark_68_model.bin': '4611ef65c87d836d03d684b30eec4d195d8b219fa1dd58fc58945831c6b9299b',
  'face_recognition_model-weights_manifest.json': 'cbaffa501b0b9275a12b63357a6843e7e30c054e1c9151e1a5f879b26e32986b',
  'face_recognition_model.bin': 'b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589',
};

try {
  const pkg = JSON.parse(await readFile(resolve(source, 'package.json'), 'utf8'));
  if (pkg.version !== '1.7.15') throw new Error('Model source must be @vladmandic/face-api 1.7.15.');
  // Validate all input before replacing any previously installed model files.
  const verified = [];
  for (const [name, expected] of Object.entries(files)) {
    const data = await readFile(resolve(source, 'model', name));
    const digest = createHash('sha256').update(data).digest('hex');
    if (digest !== expected) throw new Error(`Model integrity check failed: ${name}. Reinstall with npm ci.`);
    verified.push([name, data]);
  }
  await mkdir(destination, { recursive: true });
  for (const [name, data] of verified) await writeFile(resolve(destination, name), data);
  await writeFile(resolve(destination, 'LICENSE'), await readFile(resolve(source, 'LICENSE')));
  console.log('Verified and prepared 6 local face-model files from @vladmandic/face-api 1.7.15.');
} catch (error) {
  console.error(`Cannot prepare face recognition models: ${error.message}\nRun npm ci, then npm run models.`);
  process.exitCode = 1;
}
