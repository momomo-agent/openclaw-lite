// skills/installer.js — Skill 安装管理
const { spawn } = require('child_process');
const { execSync } = require('child_process');

/**
 * 检查命令是否存在
 * @param {string} cmd - 命令名
 * @returns {boolean}
 */
function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 安装依赖
 * @param {Object} spec - 安装规范 { kind, formula, package, module, bins }
 * @returns {Promise<string>} 安装结果
 */
async function installDependency(spec) {
  const { kind, formula, package: pkg, module: mod, bins = [] } = spec;
  
  // 检查是否已安装
  if (bins && bins.length > 0) {
    const allExist = bins.every(bin => commandExists(bin));
    if (allExist) {
      return `✅ Already installed: ${bins.join(', ')}`;
    }
  }
  
  let cmd = '';
  let description = '';
  
  switch (kind) {
    case 'brew':
      cmd = `brew install ${formula}`;
      description = `Installing ${formula} via Homebrew`;
      break;
    case 'npm':
      cmd = `npm install -g ${pkg}`;
      description = `Installing ${pkg} globally via npm`;
      break;
    case 'go':
      cmd = `go install ${mod}`;
      description = `Installing ${mod} via go install`;
      break;
    case 'uv':
      cmd = `uv pip install ${pkg}`;
      description = `Installing ${pkg} via uv`;
      break;
    default:
      return `Error: Unknown install kind: ${kind}`;
  }
  
  return new Promise((resolve) => {
    const proc = spawn(cmd, {
      shell: true,
      timeout: 120000
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        resolve(`✅ ${description}\n${stdout}`);
      } else {
        resolve(`❌ Failed to install: ${description}\n${stderr || stdout}`);
      }
    });
    
    proc.on('error', (error) => {
      resolve(`❌ Error: ${error.message}`);
    });
  });
}

/**
 * 安装 skill 的所有依赖
 * @param {Object} metadata - skill metadata
 * @returns {Promise<string>} 安装结果
 */
async function installSkillDependencies(metadata) {
  if (!metadata.install || metadata.install.length === 0) {
    return '✅ No dependencies to install';
  }
  
  const results = [];
  for (const spec of metadata.install) {
    const result = await installDependency(spec);
    results.push(result);
  }
  
  return results.join('\n\n');
}

module.exports = {
  commandExists,
  installDependency,
  installSkillDependencies
};
