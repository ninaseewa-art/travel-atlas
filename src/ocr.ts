import type { Worker } from 'tesseract.js';
export const SCREENSHOT_LIMIT = 10 * 1024 * 1024;
export async function prepareScreenshot(file: File): Promise<File> {
  if (file.size > SCREENSHOT_LIMIT) throw new Error('Выберите изображение до 10 МБ.');
  if (!file.size) throw new Error('Файл пуст. Выберите другой скриншот.');
  const heic =
    /\.(heic|heif)$/i.test(file.name) || ['image/heic', 'image/heif'].includes(file.type);
  if (!heic && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Поддерживаются PNG, JPEG, WebP и HEIC/HEIF.');
  const image: Blob = file;
  // Safari may decode HEIC natively; other browsers get a clear JPEG/PNG fallback.

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(image);
  } catch {
    throw new Error(
      'Не удалось открыть изображение. Экспортируйте его в JPEG или PNG и попробуйте снова.',
    );
  }
  if (bitmap.width * bitmap.height > 50000000) {
    bitmap.close();
    throw new Error('Слишком большое изображение. Максимум — 50 мегапикселей.');
  }
  const scale = Math.min(1, 2600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Браузер не смог обработать изображение.');
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const result = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Не удалось обработать изображение.'))),
      'image/png',
    ),
  );
  if (result.size > SCREENSHOT_LIMIT)
    throw new Error('После обработки файл больше 10 МБ. Обрежьте скриншот и повторите.');
  // No original EXIF, filename or metadata leaves the browser.
  return new File([result], 'screenshot.png', { type: 'image/png' });
}
export async function recognizeScreenshot(
  file: File,
  progress: (value: number) => void,
  signal: AbortSignal,
): Promise<{ text: string; confidence: number }> {
  const { createWorker, OEM } = await import('tesseract.js');
  let worker: Worker | undefined;
  let failed = false;
  let rejectFailure: (error: Error) => void = () => {};
  const failure = new Promise<never>((_, reject) => {
    rejectFailure = reject;
  });
  const fail = (error: Error) => {
    failed = true;
    rejectFailure(error);
  };
  const abort = () => {
    void worker?.terminate().catch(() => {});
    fail(new DOMException('Распознавание отменено', 'AbortError'));
  };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(
    () =>
      fail(
        new Error(
          'Распознавание заняло слишком много времени. Обрежьте изображение или заполните поля вручную.',
        ),
      ),
    90000,
  );
  try {
    if (signal.aborted) throw new DOMException('Распознавание отменено', 'AbortError');
    const initializing = createWorker(['rus', 'eng'], OEM.LSTM_ONLY, {
      workerPath: `${location.origin}/ocr-worker.js`,
      corePath: `${location.origin}/ocr/core`,
      langPath: `${location.origin}/ocr/lang`,
      workerBlobURL: false,
      cacheMethod: 'none',
      errorHandler: () =>
        fail(
          new Error(
            'Не удалось загрузить или запустить распознавание. Проверьте сеть, выберите другой файл или введите текст вручную.',
          ),
        ),
      logger: (m) => {
        if (!failed && !signal.aborted)
          progress(m.status === 'recognizing text' ? 0.35 + m.progress * 0.65 : m.progress * 0.3);
      },
    });
    // A cancellation during model loading must also terminate a worker that initializes later.
    void initializing.then(
      (w) => {
        if (failed || signal.aborted) void w.terminate().catch(() => {});
      },
      () => {},
    );
    worker = await Promise.race([initializing, failure]);
    if (signal.aborted) throw new DOMException('Распознавание отменено', 'AbortError');
    const result = await Promise.race([worker.recognize(file), failure]);
    return { text: result.data.text.slice(0, 20000), confidence: result.data.confidence };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    if (worker) await worker.terminate().catch(() => {});
  }
}
