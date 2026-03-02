// core/memory-watch.js — 记忆索引 + 文件监听
const path = require('path');
const fs = require('fs');
const state = require('./state');
const memoryIndex = require('../memory-index');
const { loadConfig } = require('./config');

let memoryWatcher = null;

async function buildMemoryIndex() {
  if (!state.clawDir) return;
  try {
    const config = loadConfig();
    await memoryIndex.buildIndex(state.clawDir, config, (file, done, total) => {
      if (state.mainWindow && done && total) {
        state.mainWindow.webContents.send('memory-index-progress', { file, done, total });
      }
    });
    console.log('[main] Memory index built');
  } catch (e) {
    console.warn('[main] Memory index build error:', e.message);
  }
}

function startMemoryWatch() {
  stopMemoryWatch();
  if (!state.clawDir) return;
  const memDir = path.join(state.clawDir, 'memory');
  if (!fs.existsSync(memDir)) return;
  try {
    memoryWatcher = fs.watch(memDir, { recursive: true }, (eventType, filename) => {
      if (filename && (filename.endsWith('.md') || filename.endsWith('.txt'))) {
        buildMemoryIndex();
      }
    });
  } catch (e) {
    console.warn('[main] Memory watch error:', e.message);
  }
}

function stopMemoryWatch() {
  if (memoryWatcher) {
    memoryWatcher.close();
    memoryWatcher = null;
  }
}

module.exports = { buildMemoryIndex, startMemoryWatch, stopMemoryWatch };
