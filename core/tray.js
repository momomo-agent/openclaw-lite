// core/tray.js — Tray 菜单
const { Menu, app } = require('electron');
const state = require('./state');

function updateTrayMenu() {
  if (!state.tray) return;
  state.tray._menu = Menu.buildFromTemplate([
    { label: state._trayStatusText, enabled: false },
    { type: 'separator' },
    { label: 'Show Window', click: () => { state.mainWindow?.show(); state.mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
}

module.exports = { updateTrayMenu };
