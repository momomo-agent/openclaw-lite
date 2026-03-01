// tools/exec.js
const { registerTool } = require('./registry');
const { spawn } = require('child_process');
const path = require('path');

registerTool({
  name: 'shell_exec',
  description: 'Execute a shell command in the workspace directory',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The shell command to execute'
      }
    },
    required: ['command']
  },
  handler: async (args, context) => {
    const { clawDir, approvalCallback } = context;
    
    // Request approval for dangerous commands
    if (approvalCallback) {
      const approved = await approvalCallback({
        type: 'shell_exec',
        command: args.command
      });
      if (!approved) {
        return 'Command execution cancelled by user';
      }
    }
    
    return new Promise((resolve) => {
      const proc = spawn(args.command, {
        shell: true,
        cwd: clawDir,
        timeout: 30000
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
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        resolve(code === 0 ? output : `Command failed (exit ${code}):\n${output}`);
      });
      
      proc.on('error', (error) => {
        resolve(`Error executing command: ${error.message}`);
      });
    });
  }
});

registerTool({
  name: 'code_exec',
  description: 'Execute code in a specific language (python, javascript, bash)',
  parameters: {
    type: 'object',
    properties: {
      language: {
        type: 'string',
        enum: ['python', 'javascript', 'bash'],
        description: 'Programming language'
      },
      code: {
        type: 'string',
        description: 'Code to execute'
      }
    },
    required: ['language', 'code']
  },
  handler: async (args, context) => {
    const { clawDir } = context;
    const { language, code } = args;
    
    const commands = {
      python: `python3 -c ${JSON.stringify(code)}`,
      javascript: `node -e ${JSON.stringify(code)}`,
      bash: code
    };
    
    const command = commands[language];
    if (!command) {
      return `Unsupported language: ${language}`;
    }
    
    return new Promise((resolve) => {
      const proc = spawn(command, {
        shell: true,
        cwd: clawDir,
        timeout: 30000
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
        const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : '');
        resolve(code === 0 ? output : `Execution failed (exit ${code}):\n${output}`);
      });
      
      proc.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });
    });
  }
});
