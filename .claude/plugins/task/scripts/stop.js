const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

// Read stdin (hook input)
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    const projectDir = utils.getProjectDir();
    const taskDir = path.join(projectDir, '.claude', 'task');

    // Get active task
    const activeTask = utils.getActiveTask(projectDir);

    if (!activeTask) {
      process.exit(0);
    }

    const logPath = path.join(taskDir, activeTask, 'decisions.log');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] Session stopped\n`;

    // Rotate log if needed
    utils.rotateLogIfNeeded(logPath);

    // Append with lock
    utils.appendFileLocked(logPath, entry);

  } catch (error) {
    // Log error properly instead of silent fail
    try {
      const projectDir = utils.getProjectDir();
      utils.logError(projectDir, error, 'stop.js');
    } catch (e) {
      console.error('Stop hook error:', error.message);
    }
  }
  process.exit(0);
});
