import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'public/ocr');
await mkdir(path.join(target, 'core'), { recursive: true });
await mkdir(path.join(target, 'lang'), { recursive: true });
await copyFile(
  path.join(root, 'node_modules/tesseract.js/dist/worker.min.js'),
  path.join(target, 'worker.min.js'),
);
await copyFile(
  path.join(root, 'node_modules/tesseract.js/dist/worker.min.js.LICENSE.txt'),
  path.join(target, 'worker.min.js.LICENSE.txt'),
);
for (const name of await readdir(path.join(root, 'node_modules/tesseract.js-core'))) {
  if (name.endsWith('.wasm.js'))
    await copyFile(
      path.join(root, 'node_modules/tesseract.js-core', name),
      path.join(target, 'core', name),
    );
}
for (const lang of ['rus', 'eng'])
  await copyFile(
    path.join(
      root,
      `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    ),
    path.join(target, 'lang', `${lang}.traineddata.gz`),
  );
for (const [source, name] of [
  ['tesseract.js/LICENSE.md', 'TESSERACT-JS-LICENSE.txt'],
  ['tesseract.js-core/LICENSE', 'TESSERACT-CORE-LICENSE.txt'],
])
  await copyFile(path.join(root, 'node_modules', source), path.join(target, name));
console.log('Local OCR worker, WASM and Russian/English models prepared.');
