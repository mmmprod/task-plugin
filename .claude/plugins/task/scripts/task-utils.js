const fs = require('fs');
const path = require('path');

// Constants
const TASK_ID_PATTERN = /^task_\d{8}_\d{6}$/;
const MAX_LOG_LINES = 500;
const LOCK_TIMEOUT = 5000;

/**
 * Get project directory reliably
 */
function getProjectDir() {
  // Priority: env var > cwd with .claude check > cwd
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, '.claude'))) {
    return cwd;
  }

  // Walk up to find .claude directory
  let dir = cwd;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return cwd; // Fallback
}

/**
 * Validate task ID format
 */
function isValidTaskId(taskId) {
  return TASK_ID_PATTERN.test(taskId);
}

/**
 * Get all valid tasks sorted by date (newest first)
 */
function getTasks(taskDir) {
  if (!fs.existsSync(taskDir)) {
    return [];
  }

  return fs.readdirSync(taskDir)
    .filter(f => {
      const fullPath = path.join(taskDir, f);
      return fs.statSync(fullPath).isDirectory() && isValidTaskId(f);
    })
    .sort()
    .reverse();
}

/**
 * Get active task from CLAUDE.md or fallback to most recent
 */
function getActiveTask(projectDir) {
  const claudeMd = path.join(projectDir, '.claude', 'CLAUDE.md');
  const taskDir = path.join(projectDir, '.claude', 'task');

  // Try to read active task from CLAUDE.md
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf8');
    const match = content.match(/@\.claude\/task\/(task_\d{8}_\d{6})\/plan\.md/);
    if (match && isValidTaskId(match[1])) {
      const taskPath = path.join(taskDir, match[1]);
      if (fs.existsSync(taskPath)) {
        return match[1];
      }
    }
  }

  // Fallback to most recent valid task
  const tasks = getTasks(taskDir);
  return tasks.length > 0 ? tasks[0] : null;
}

/**
 * Simple file lock using .lock file
 */
function acquireLock(filePath, timeout = LOCK_TIMEOUT) {
  const lockPath = filePath + '.lock';
  const start = Date.now();

  while (Date.now() - start < timeout) {
    try {
      fs.writeFileSync(lockPath, process.pid.toString(), { flag: 'wx' });
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if lock is stale (older than 30 seconds)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            fs.unlinkSync(lockPath);
            continue;
          }
        } catch (err) {
          // Lock file gone, retry
          continue;
        }
        // Wait and retry
        const waitTime = Math.min(100, timeout - (Date.now() - start));
        if (waitTime > 0) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitTime);
        }
      } else {
        return false;
      }
    }
  }
  return false;
}

/**
 * Release file lock
 */
function releaseLock(filePath) {
  const lockPath = filePath + '.lock';
  try {
    fs.unlinkSync(lockPath);
  } catch (e) {
    // Ignore - lock may already be released
  }
}

/**
 * Write file with lock
 */
function writeFileLocked(filePath, content) {
  if (!acquireLock(filePath)) {
    throw new Error(`Could not acquire lock for ${filePath}`);
  }
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Append to file with lock
 */
function appendFileLocked(filePath, content) {
  if (!acquireLock(filePath)) {
    throw new Error(`Could not acquire lock for ${filePath}`);
  }
  try {
    fs.appendFileSync(filePath, content, 'utf8');
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Rotate log file if too large
 */
function rotateLogIfNeeded(logPath, maxLines = MAX_LOG_LINES) {
  if (!fs.existsSync(logPath)) return;

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');

  if (lines.length > maxLines) {
    // Keep last maxLines entries
    const trimmed = lines.slice(-maxLines).join('\n');
    writeFileLocked(logPath, trimmed);
  }
}

/**
 * Create backup of a file
 */
function backupFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const backupPath = filePath + '.backup';
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

/**
 * Log error to file
 */
function logError(projectDir, error, context = '') {
  const logPath = path.join(projectDir, '.claude', 'task', 'error.log');
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${context}: ${error.message || error}\n${error.stack || ''}\n`;

  try {
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    // Last resort: console
    console.error(entry);
  }
}

module.exports = {
  getProjectDir,
  isValidTaskId,
  getTasks,
  getActiveTask,
  acquireLock,
  releaseLock,
  writeFileLocked,
  appendFileLocked,
  rotateLogIfNeeded,
  backupFile,
  logError,
  TASK_ID_PATTERN,
  MAX_LOG_LINES
};
