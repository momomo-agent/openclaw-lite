// core/agents.js — Agent CRUD
const path = require('path');
const fs = require('fs');
const state = require('./state');

function agentsDir() {
  return state.clawDir ? path.join(state.clawDir, 'agents') : null;
}

function listAgents() {
  const dir = agentsDir();
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}

function loadAgent(id) {
  const dir = agentsDir();
  if (!dir) return null;
  const p = path.join(dir, `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function saveAgent(agent) {
  const dir = agentsDir();
  if (!dir) return;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${agent.id}.json`), JSON.stringify(agent, null, 2));
}

function createAgent(name, soul, model) {
  const id = name.toLowerCase().replace(/\s+/g, '-');
  const agent = { id, name, soul: soul || '', model: model || '', createdAt: new Date().toISOString() };
  saveAgent(agent);
  return agent;
}

module.exports = { agentsDir, listAgents, loadAgent, saveAgent, createAgent };
