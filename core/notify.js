// core/notify.js — 通知 + Watson Status
const { Notification } = require('electron');
const state = require('./state');

function pushStatus(win, statusState, detail) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('status', { state: statusState, detail });
  }
}

function sendNotification(title, body) {
  try {
    new Notification({ title, body }).show();
  } catch {}
}

function pushWatsonStatus(level, text, requestId) {
  const rid = requestId || state._activeRequestId;
  const payload = { level, text, requestId: rid };
  state.mainWindow?.webContents?.send('watson-status', payload);
  state._trayStatusText = text || '空闲待命中';
}

module.exports = { pushStatus, sendNotification, pushWatsonStatus };
