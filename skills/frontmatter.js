// skills/frontmatter.js — Skill frontmatter 解析 (OpenClaw-aligned)
const fs = require('fs');
const path = require('path');

// Allowed frontmatter keys (OpenClaw-aligned)
const ALLOWED_FM_KEYS = new Set([
  'name', 'description', 'license', 'allowed-tools', 'metadata',
  'user-invocable', 'disable-model-invocation'
]);

/**
 * 解析 SKILL.md 的 frontmatter
 * OpenClaw-aligned dual-parse: regex for simple YAML, JSON.parse for metadata
 * @param {string} content - SKILL.md 内容
 * @returns {Object} { frontmatter, body }
 */
function parseFrontmatter(content) {
  // CRLF normalization
  content = content.replace(/\r\n?/g, '\n');

  const lines = content.split('\n');

  // 查找 --- 分隔符
  let startIdx = -1;
  let endIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      if (startIdx === -1) {
        startIdx = i;
      } else {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1 || endIdx === -1) {
    return { frontmatter: {}, body: content };
  }

  const fmLines = lines.slice(startIdx + 1, endIdx);
  const body = lines.slice(endIdx + 1).join('\n');

  // Parse frontmatter lines with multiline support
  const frontmatter = {};
  let currentKey = null;
  let currentValue = '';

  function commitKV() {
    if (currentKey !== null) {
      const val = currentValue.trim();
      frontmatter[currentKey] = parseValue(currentKey, val);
      currentKey = null;
      currentValue = '';
    }
  }

  for (const line of fmLines) {
    // Continuation line: starts with 2+ spaces or tab
    if (currentKey !== null && /^(?:  |\t)/.test(line)) {
      currentValue += ' ' + line.trim();
      continue;
    }

    // New key-value line: supports hyphenated keys ([\w-]+)
    const match = line.match(/^([\w-]+):\s*(.*)$/);
    if (match) {
      commitKV();
      currentKey = match[1];
      currentValue = match[2];
      continue;
    }

    // Empty or unrecognized line — commit previous if any
    if (line.trim() === '') {
      commitKV();
    }
  }
  commitKV();

  return { frontmatter, body };
}

/**
 * Parse a frontmatter value based on its key and content
 */
function parseValue(key, value) {
  if (!value) return key === 'allowed-tools' ? [] : '';

  // metadata: parse as JSON object
  if (key === 'metadata' && value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Array notation: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(v => v.trim()).filter(Boolean);
  }

  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  return value;
}

/**
 * Validate skill name (OpenClaw-aligned)
 * @param {string} name
 * @returns {{ valid: boolean, error?: string }}
 */
function validateSkillName(name) {
  if (!name || typeof name !== 'string') return { valid: false, error: 'Name is required' };
  if (name.length > 64) return { valid: false, error: 'Name must be 64 chars or less' };
  if (!/^[a-z0-9-]+$/.test(name)) return { valid: false, error: 'Name must match ^[a-z0-9-]+$' };
  if (/^-|-$/.test(name)) return { valid: false, error: 'Name cannot start or end with -' };
  if (/--/.test(name)) return { valid: false, error: 'Name cannot contain consecutive dashes' };
  return { valid: true };
}

/**
 * Normalize skill name (OpenClaw-aligned normalize_skill_name)
 * @param {string} input
 * @returns {string}
 */
function normalizeSkillName(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/**
 * 从 skill 目录读取并解析 SKILL.md
 * @param {string} skillDir - skill 目录路径
 * @returns {Object} skill metadata
 */
function loadSkillMetadata(skillDir) {
  const skillMdPath = path.join(skillDir, 'SKILL.md');

  if (!fs.existsSync(skillMdPath)) {
    return null;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract from metadata.openclaw or metadata.paw sub-object (OpenClaw-aligned)
  const metaObj = (frontmatter.metadata && typeof frontmatter.metadata === 'object')
    ? (frontmatter.metadata.openclaw || frontmatter.metadata.paw || {})
    : {};

  // Helper: read from metaObj first, then frontmatter top-level (backward compat)
  const get = (key, def) => metaObj[key] !== undefined ? metaObj[key] : (frontmatter[key] !== undefined ? frontmatter[key] : def);

  return {
    name: frontmatter.name || path.basename(skillDir),
    path: skillDir,
    frontmatter,
    body,
    // Extracted metadata — metaObj > frontmatter top-level > default
    always: get('always', false) === true,
    requires: get('requires', []),
    os: get('os', []),
    primaryEnv: get('primaryEnv', undefined),
    emoji: get('emoji', undefined),
    homepage: get('homepage', undefined),
    skillKey: get('skillKey', path.basename(skillDir)),
    install: get('install', []),
    // New fields
    'allowed-tools': frontmatter['allowed-tools'] || [],
    'user-invocable': frontmatter['user-invocable'],
    'disable-model-invocation': frontmatter['disable-model-invocation'],
    description: frontmatter.description || '',
  };
}

/**
 * 扫描 skills 目录并加载所有 skill metadata
 * @param {string} skillsDir - skills 目录路径
 * @returns {Array} skill metadata 数组
 */
function loadAllSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const skills = [];
  const entries = fs.readdirSync(skillsDir);

  for (const entry of entries) {
    const skillDir = path.join(skillsDir, entry);
    const stat = fs.statSync(skillDir);

    if (stat.isDirectory()) {
      const metadata = loadSkillMetadata(skillDir);
      if (metadata) {
        skills.push(metadata);
      }
    }
  }

  return skills;
}

module.exports = {
  parseFrontmatter,
  loadSkillMetadata,
  loadAllSkills,
  validateSkillName,
  normalizeSkillName
};
