// core/acpx.js — acpx CLI wrapper
const { spawn } = require('child_process');
const path = require('path');

let acpxBin = null;

// Detect acpx binary on startup
function init() {
  try {
    const acpxPkg = require.resolve('acpx');
    acpxBin = path.join(path.dirname(acpxPkg), '../.bin/acpx');
  } catch (e) {
    console.warn('[acpx] not found in node_modules, acpx features disabled');
  }
}

function isAvailable() {
  return acpxBin !== null;
}

// Execute acpx command with JSONL output parsing
function runAcpx(args, options = {}) {
  if (!isAvailable()) {
    throw new Error('acpx not available');
  }

  const { cwd = process.cwd(), timeout = 300000, onOutput } = options;
  const isJsonFormat = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let lineBuffer = '';

    const proc = spawn(acpxBin, args, {
      cwd,
      env: { ...process.env, TERM: 'dumb' }
    });

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

      if (onOutput && isJsonFormat) {
        lineBuffer += chunk;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            const text = obj.text || obj.result || '';
            if (text) onOutput(text);
          } catch (e) {
            onOutput(line + '\n');
          }
        }
      } else if (onOutput) {
        onOutput(chunk);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`acpx exited with code ${code}: ${stderr || stdout}`));
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

// Parse JSONL output
function parseJsonl(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const lastLine = lines[lines.length - 1];
  try {
    return JSON.parse(lastLine);
  } catch (e) {
    throw new Error(`Failed to parse acpx JSON output: ${e.message}`);
  }
}

// One-shot execution
async function exec(agent, prompt, options = {}) {
  const args = [agent, 'exec', prompt, '--format', 'json'];
  if (options.approveAll) args.push('--approve-all');
  if (options.session) args.push('--session', options.session);

  const { stdout } = await runAcpx(args, options);
  const result = parseJsonl(stdout);

  return {
    text: result.result || stdout,
    cost: result.total_cost_usd,
    isError: !!result.is_error
  };
}

// Persistent session execution
async function prompt(agent, promptText, options = {}) {
  const args = [agent, 'prompt', promptText, '--format', 'json'];
  if (options.approveAll) args.push('--approve-all');
  if (options.session) args.push('--session', options.session);

  const { stdout } = await runAcpx(args, options);
  const result = parseJsonl(stdout);

  return {
    text: result.result || stdout,
    cost: result.total_cost_usd,
    isError: !!result.is_error,
    sessionName: result.session_id || options.session
  };
}

// Cancel current task
async function cancel(agent, options = {}) {
  const args = [agent, 'cancel'];
  if (options.session) args.push('--session', options.session);
  await runAcpx(args, options);
}

// Get status
async function status(agent, options = {}) {
  const args = [agent, 'status', '--format', 'json'];
  if (options.session) args.push('--session', options.session);

  const { stdout } = await runAcpx(args, options);
  return parseJsonl(stdout);
}

// Set mode
async function setMode(agent, mode, options = {}) {
  const args = [agent, 'set-mode', mode];
  if (options.session) args.push('--session', options.session);
  await runAcpx(args, options);
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
