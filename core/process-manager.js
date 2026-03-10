// core/process-manager.js — Background process management (OpenClaw-aligned)

const { spawn } = require('child_process');
const sessions = new Map(); // sessionId -> { proc, stdout, stderr, exitCode, startedAt }

let nextId = 1;

function startBackground(command, opts = {}) {
  const id = `bg-${nextId++}-${Date.now().toString(36)}`;
  const proc = spawn(command, {
    shell: true,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env },
    timeout: (opts.timeoutSec || 1800) * 1000,
  });

  const session = {
    id,
    command,
    proc,
    stdout: '',
    stderr: '',
    exitCode: null,
    startedAt: Date.now(),
    done: false,
  };

  proc.stdout.on('data', (data) => { session.stdout += data.toString(); });
  proc.stderr.on('data', (data) => { session.stderr += data.toString(); });
  proc.on('close', (code) => {
    session.exitCode = code;
    session.done = true;
  });
  proc.on('error', (err) => {
    session.stderr += `\nError: ${err.message}`;
    session.done = true;
  });

  sessions.set(id, session);
  return id;
}

function listSessions() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    command: s.command,
    done: s.done,
    exitCode: s.exitCode,
    startedAt: s.startedAt,
    outputLength: s.stdout.length + s.stderr.length,
  }));
}

function getLog(id, opts = {}) {
  const s = sessions.get(id);
  if (!s) return null;
  const lines = (s.stdout + (s.stderr ? `\nSTDERR:\n${s.stderr}` : '')).split('\n');
  const offset = opts.offset || 0;
  const limit = opts.limit || 50;
  return {
    lines: lines.slice(offset, offset + limit).join('\n'),
    total: lines.length,
    done: s.done,
    exitCode: s.exitCode,
  };
}

function poll(id) {
  const s = sessions.get(id);
  if (!s) return { error: 'Session not found' };
  return {
    id: s.id,
    done: s.done,
    exitCode: s.exitCode,
    outputTail: s.stdout.slice(-2000) + (s.stderr ? `\nSTDERR:\n${s.stderr.slice(-500)}` : ''),
  };
}

function kill(id) {
  const s = sessions.get(id);
  if (!s || s.done) return false;
  s.proc.kill('SIGTERM');
  setTimeout(() => { if (!s.done) s.proc.kill('SIGKILL'); }, 5000);
  return true;
}

function remove(id) {
  return sessions.delete(id);
}

module.exports = { startBackground, listSessions, getLog, poll, kill, remove };
