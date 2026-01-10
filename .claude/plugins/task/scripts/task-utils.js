const fs = require('fs');
const path = require('path');

// Constants
const TASK_ID_PATTERN = /^task_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/;
const MAX_LOG_LINES = 500;
const LOCK_TIMEOUT = 5000;
const LOCK_RETRY_DELAY = 50;
const MAX_BACKUPS = 5;
const MAX_DEPTH = 10;
const CACHE_TTL = 1000;

// Global state
let taskCache = null;
let cacheTime = 0;
if (!global._activeLocks) global._activeLocks = new Set();

// Cleanup locks on process exit
process.on('exit', () => {
  global._activeLocks.forEach(lockPath => {
    try {
      fs.unlinkSync(lockPath);
    } catch (e) {
      // Ignore
    }
  });
});

/**
 * Sleep for ms milliseconds
 */
function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy wait but short duration
  }
}

/**
 * Get project directory reliably with max depth limit
 */
function getProjectDir() {
  // Priority: env var with validation
  if (process.env.CLAUDE_PROJECT_DIR) {
    const dir = process.env.CLAUDE_PROJECT_DIR;
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
  }

  // Walk up to find .claude directory with depth limit
  let dir = process.cwd();
  let depth = 0;

  while (dir !== path.dirname(dir) && depth < MAX_DEPTH) {
    if (fs.existsSync(path.join(dir, '.claude'))) {
      return dir;
    }
    dir = path.dirname(dir);
    depth++;
  }

  throw new Error('.claude directory not found within ' + MAX_DEPTH + ' levels');
}

/**
 * Validate task ID format with date validation
 */
function isValidTaskId(taskId) {
  if (!taskId || typeof taskId !== 'string') return false;

  const match = taskId.match(TASK_ID_PATTERN);
  if (!match) return false;

  const [_, year, month, day, hour, min, sec] = match.map(Number);

  // Basic range validation
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23) return false;
  if (min < 0 || min > 59) return false;
  if (sec < 0 || sec > 59) return false;

  // Validate actual date
  const date = new Date(year, month - 1, day, hour, min, sec);
  return !isNaN(date.getTime());
}

/**
 * Validate task directory has required files
 */
function validateTaskFiles(taskPath) {
  const required = ['plan.md', 'checklist.md', 'handoff.md', 'decisions.log'];
  const missing = required.filter(f => !fs.existsSync(path.join(taskPath, f)));
  return {
    valid: missing.length === 0,
    missing,
    canRepair: missing.length < required.length
  };
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
 * Get active task from CLAUDE.md or fallback to most recent (with cache)
 */
function getActiveTask(projectDir, useCache = true) {
  // Check cache
  if (useCache && taskCache && Date.now() - cacheTime < CACHE_TTL) {
    return taskCache;
  }

  const claudeMd = path.join(projectDir, '.claude', 'CLAUDE.md');
  const taskDir = path.join(projectDir, '.claude', 'task');

  let result = null;

  // Try to read active task from CLAUDE.md
  if (fs.existsSync(claudeMd)) {
    try {
      const content = fs.readFileSync(claudeMd, 'utf8');
      const match = content.match(/@\.claude\/task\/(task_\d{8}_\d{6})\/plan\.md/);
      if (match && isValidTaskId(match[1])) {
        const taskPath = path.join(taskDir, path.basename(match[1])); // Path traversal protection
        if (fs.existsSync(taskPath)) {
          result = match[1];
        }
      }
    } catch (e) {
      // Fall through to fallback
    }
  }

  // Fallback to most recent valid task
  if (!result) {
    const tasks = getTasks(taskDir);
    result = tasks.length > 0 ? tasks[0] : null;
  }

  // Update cache
  taskCache = result;
  cacheTime = Date.now();

  return result;
}

/**
 * Atomic file lock using exclusive write
 */
function acquireLock(filePath, timeout = LOCK_TIMEOUT) {
  const lockPath = filePath + '.lock';
  const startTime = Date.now();
  const pid = process.pid.toString();

  while (true) {
    try {
      // Atomic create - fails if file exists
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, pid);
      fs.closeSync(fd);
      global._activeLocks.add(lockPath);
      return true;
    } catch (e) {
      if (e.code === 'EEXIST') {
        // Check if lock is stale (older than 30 seconds)
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 30000) {
            // Stale lock - try to remove it
            try {
              fs.unlinkSync(lockPath);
              continue; // Retry immediately
            } catch (unlinkErr) {
              // Someone else removed it, retry
              continue;
            }
          }
        } catch (statErr) {
          // Lock file gone, retry
          continue;
        }

        // Check timeout
        if (Date.now() - startTime >= timeout) {
          return false;
        }

        // Wait before retry
        sleep(LOCK_RETRY_DELAY);
      } else {
        // Other error (permissions, etc.)
        return false;
      }
    }
  }
}

/**
 * Release file lock
 */
function releaseLock(filePath) {
  const lockPath = filePath + '.lock';
  try {
    fs.unlinkSync(lockPath);
    global._activeLocks.delete(lockPath);
  } catch (e) {
    // Ignore - lock may already be released
  }
}

/**
 * Read file with lock
 */
function readFileLocked(filePath, timeout = LOCK_TIMEOUT) {
  if (!fs.existsSync(filePath)) {
    return '';
  }

  if (!acquireLock(filePath, timeout)) {
    // Fallback: read without lock
    return fs.readFileSync(filePath, 'utf8');
  }

  try {
    return fs.readFileSync(filePath, 'utf8');
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Write file with lock
 */
function writeFileLocked(filePath, content, timeout = LOCK_TIMEOUT) {
  if (!acquireLock(filePath, timeout)) {
    throw new Error('Could not acquire lock for ' + filePath);
  }
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Append to file with lock and fallback
 */
function appendFileLocked(filePath, content, timeout = LOCK_TIMEOUT) {
  if (!acquireLock(filePath, timeout)) {
    // Fallback: write to pending file
    const pendingPath = filePath + '.pending';
    fs.appendFileSync(pendingPath, content);
    console.warn('Lock failed, wrote to ' + pendingPath);
    return;
  }
  try {
    fs.appendFileSync(filePath, content, 'utf8');
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Read last N lines efficiently
 */
function readLastLines(filePath, count) {
  if (!fs.existsSync(filePath)) return [];

  const stat = fs.statSync(filePath);
  if (stat.size === 0) return [];

  // For small files, just read the whole thing
  if (stat.size < 64 * 1024) {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').slice(-count);
  }

  // For large files, read from the end
  const bufferSize = 64 * 1024;
  const fd = fs.openSync(filePath, 'r');

  try {
    let lines = [];
    let position = stat.size;
    const buffer = Buffer.alloc(bufferSize);
    let leftover = '';

    while (lines.length < count && position > 0) {
      const readSize = Math.min(bufferSize, position);
      position -= readSize;

      fs.readSync(fd, buffer, 0, readSize, position);
      const chunk = buffer.toString('utf8', 0, readSize) + leftover;
      const chunkLines = chunk.split('\n');

      leftover = chunkLines.shift() || '';
      lines = chunkLines.concat(lines);
    }

    if (leftover && lines.length < count) {
      lines.unshift(leftover);
    }

    return lines.slice(-count);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Clean old backup files
 */
function cleanOldBackups(dir, baseName, maxBackups = MAX_BACKUPS) {
  try {
    const pattern = new RegExp('^\\.' + baseName.replace('.', '\\.') + '\\.(\\d+)\\.bak$');
    const backups = fs.readdirSync(dir)
      .filter(f => pattern.test(f))
      .map(f => ({
        name: f,
        time: parseInt(f.match(pattern)[1], 10)
      }))
      .sort((a, b) => b.time - a.time);

    backups.slice(maxBackups).forEach(b => {
      try {
        fs.unlinkSync(path.join(dir, b.name));
      } catch (e) {
        // Ignore
      }
    });
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Rotate log file if too large (with lock and backup)
 */
function rotateLogIfNeeded(logPath, maxLines = MAX_LOG_LINES) {
  if (!fs.existsSync(logPath)) return;

  if (!acquireLock(logPath)) {
    return; // Skip rotation if can't get lock
  }

  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');

    if (lines.length > maxLines) {
      // Backup before rotation
      const dir = path.dirname(logPath);
      const baseName = path.basename(logPath);
      const backupPath = path.join(dir, '.' + baseName + '.' + Date.now() + '.bak');
      fs.writeFileSync(backupPath, content);

      // Keep last maxLines entries
      const kept = lines.slice(-maxLines);
      const header = '[ROTATED AT ' + new Date().toISOString() + ']\n';
      fs.writeFileSync(logPath, header + kept.join('\n'));

      // Clean old backups
      cleanOldBackups(dir, baseName, 3);
    }
  } finally {
    releaseLock(logPath);
  }
}

/**
 * Create backup of a file with limit
 */
function backupFile(filePath, maxBackups = MAX_BACKUPS) {
  if (!fs.existsSync(filePath)) return null;

  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const backupPath = path.join(dir, '.' + baseName + '.' + Date.now() + '.bak');

  fs.copyFileSync(filePath, backupPath);

  // Clean old backups
  cleanOldBackups(dir, baseName, maxBackups);

  return backupPath;
}

/**
 * Log error to file
 */
function logError(projectDir, error, context = '') {
  const logPath = path.join(projectDir, '.claude', 'task', 'error.log');
  const timestamp = new Date().toISOString();
  const entry = '[' + timestamp + '] ' + context + ': ' + (error.message || error) + '\n' + (error.stack || '') + '\n';

  try {
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    // Last resort: console
    console.error(entry);
  }
}

/**
 * Safe path join with traversal protection
 */
function safePathJoin(baseDir, ...parts) {
  const safeParts = parts.map(p => path.basename(p));
  return path.join(baseDir, ...safeParts);
}

module.exports = {
  getProjectDir,
  isValidTaskId,
  validateTaskFiles,
  getTasks,
  getActiveTask,
  acquireLock,
  releaseLock,
  readFileLocked,
  writeFileLocked,
  appendFileLocked,
  readLastLines,
  rotateLogIfNeeded,
  backupFile,
  logError,
  safePathJoin,
  cleanOldBackups,
  TASK_ID_PATTERN,
  MAX_LOG_LINES,
  MAX_BACKUPS
};
