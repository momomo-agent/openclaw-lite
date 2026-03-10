// core/acpx.js — Claude Code CLI wrapper (direct claude CLI, not acpx)
const { spawn, execSync } = require('child_process');
const path = require('path');

let claudeBin = null;
let acpxBin = null;

// Detect claude binary on startup
function init() {
  const fs = require('fs');

  // 1. Try claude CLI directly (preferred — supports --print --permission-mode)
  try {
    const which = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim();
    if (which && fs.existsSync(which)) {
      claudeBin = which;
      console.log('[acpx] claude CLI found at', claudeBin);
      return;
    }
  } catch {}

  // 2. Fallback: try acpx in node_modules
  const localBin = path.join(__dirname, '..', 'node_modules', '.bin', 'acpx');
  if (fs.existsSync(localBin)) {
    acpxBin = localBin;
    console.log('[acpx] acpx found at', acpxBin);
    return;
  }

  console.warn('[acpx] neither claude CLI nor acpx found, coding agent disabled');
}

function isAvailable() {
  return claudeBin !== null || acpxBin !== null;
}

// Execute command with output streaming
function runCommand(bin, args, options = {}) {
  const { cwd = process.cwd(), timeout = 300000, onOutput } = options;

  console.log(`[acpx] spawning: ${bin} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    const proc = spawn(bin, args, {
      cwd,
      env: { ...process.env, TERM: 'dumb' }
    });

    console.log(`[acpx] spawned pid=${proc.pid}`);

    const timer = timeout ? setTimeout(() => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (proc && !proc.killed) proc.kill('SIGKILL');
        }, 2000);
      }
    }, timeout) : null;

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      if (onOutput) onOutput(chunk);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`exited with code ${code}: ${(stderr || stdout).slice(0, 500)}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    proc.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  });
}

// One-shot execution
async function exec(agent, prompt, options = {}) {
  if (claudeBin) {
    // Direct claude CLI: --print for non-interactive, --permission-mode bypassPermissions for auto-approve
    const args = ['--print', '--permission-mode', 'bypassPermissions', prompt];
    const { stdout } = await runCommand(claudeBin, args, options);
    return { text: stdout, cost: undefined, isError: false };
  }

  // Fallback: acpx
  const args = [agent, 'exec', prompt];
  if (options.session) args.push('--session', options.session);
  const { stdout } = await runCommand(acpxBin, args, options);
  return { text: stdout, cost: undefined, isError: false };
}

// Persistent session execution
async function prompt(agent, promptText, options = {}) {
  if (claudeBin) {
    // claude CLI with --print and session resume
    const args = ['--print', '--permission-mode', 'bypassPermissions'];
    if (options.session) args.push('--resume', options.session);
    args.push(promptText);
    const { stdout } = await runCommand(claudeBin, args, options);
    return { text: stdout, cost: undefined, isError: false, sessionName: options.session };
  }

  // Fallback: acpx
  const args = [agent, 'prompt', promptText];
  if (options.session) args.push('--session', options.session);
  const { stdout } = await runCommand(acpxBin, args, options);
  return { text: stdout, cost: undefined, isError: false, sessionName: options.session };
}

// Cancel current task
async function cancel(agent, options = {}) {
  // No-op for direct claude CLI (process gets killed)
}

// Get status
async function status(agent, options = {}) {
  return { status: 'unknown' };
}

// Set mode
async function setMode(agent, mode, options = {}) {
  // No-op for direct claude CLI
}

module.exports = {
  init,
  isAvailable,
  exec,
  prompt,
  cancel,
  status,
  setMode
};
