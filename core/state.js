// core/state.js — 应用全局状态（单例）
// 所有模块通过 require 共享同一个对象

const state = {
  mainWindow: null,
  clawDir: null,
  currentSessionId: null,
  currentAgentName: null,
  heartbeatTimer: null,
  tray: null,
  _trayStatusText: '空闲待命中',
  _activeRequestId: null,
  keyStats: {},          // API key rotation stats
  currentKeyIndex: 0     // API key rotation index
};

module.exports = state;
