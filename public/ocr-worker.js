/* global importScripts */
// Keep failed model initialization from leaving an idle worker alive.
const forward = self.postMessage.bind(self);
self.postMessage = (...args) => {
  forward(...args);
  const message = args[0];
  if (message?.status === 'reject' && ['load', 'loadLanguage', 'initialize'].includes(message.action)) self.close();
};
importScripts('/ocr/worker.min.js');
