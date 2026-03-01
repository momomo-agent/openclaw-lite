// skills/frontmatter.js — Skill frontmatter 解析
const fs = require('fs');
const path = require('path');

/**
 * 解析 SKILL.md 的 frontmatter
 * @param {string} content - SKILL.md 内容
 * @returns {Object} { frontmatter, body }
 */
function parseFrontmatter(content) {
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
  
  const frontmatterText = lines.slice(startIdx + 1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  
  // 简单 YAML 解析
  const frontmatter = {};
  for (const line of frontmatterText.split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      // 处理数组
      if (value.startsWith('[') && value.endsWith(']')) {
        frontmatter[key] = value.slice(1, -1).split(',').map(v => v.trim());
      } else if (value === 'true') {
        frontmatter[key] = true;
      } else if (value === 'false') {
        frontmatter[key] = false;
      } else {
        frontmatter[key] = value;
      }
    }
  }
  
  return { frontmatter, body };
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
  
  return {
    name: path.basename(skillDir),
    path: skillDir,
    frontmatter,
    body,
    // 提取的元数据
    always: frontmatter.always === true,
    requires: frontmatter.requires || [],
    os: frontmatter.os || [],
    primaryEnv: frontmatter.primaryEnv,
    emoji: frontmatter.emoji,
    homepage: frontmatter.homepage,
    skillKey: frontmatter.skillKey || path.basename(skillDir),
    install: frontmatter.install || []
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
  loadAllSkills
};
