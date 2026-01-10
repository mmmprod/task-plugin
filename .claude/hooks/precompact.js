const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

try {
  const projectDir = utils.getProjectDir();
  const taskDir = path.join(projectDir, '.claude', 'task');

  // Get active task (from CLAUDE.md or most recent valid)
  const activeTask = utils.getActiveTask(projectDir);

  if (!activeTask || !utils.isValidTaskId(activeTask)) {
    process.exit(0);
  }

  // Path traversal protection
  const taskPath = utils.safePathJoin(taskDir, activeTask);

  // Validate task files exist
  const validation = utils.validateTaskFiles(taskPath);
  if (!validation.valid && !validation.canRepair) {
    utils.logError(projectDir, new Error('Task corrupted: missing ' + validation.missing.join(', ')), 'precompact.js');
    process.exit(0); // Don't block compact
  }

  // Read current files with locks
  const planPath = path.join(taskPath, 'plan.md');
  const checklistPath = path.join(taskPath, 'checklist.md');
  const decisionsPath = path.join(taskPath, 'decisions.log');
  const handoffPath = path.join(taskPath, 'handoff.md');

  const plan = utils.readFileLocked(planPath);
  const checklist = utils.readFileLocked(checklistPath);

  // Use efficient last lines reading for decisions
  const recentDecisions = utils.readLastLines(decisionsPath, 20);

  // Backup existing handoff before overwriting (with limit)
  utils.backupFile(handoffPath, 5);

  // Generate handoff - include FULL plan
  const timestamp = new Date().toISOString();
  const handoff = `# Handoff Notes

Generated: ${timestamp}
Task: ${activeTask}

## Plan
${plan}

## Checklist Status
${checklist}

## Recent Decisions (last 20)
${recentDecisions.join('\n')}

## Next Actions
Continue from where this task left off. Check checklist for pending items.
`;

  // Write handoff with lock
  utils.writeFileLocked(handoffPath, handoff);

  // Rotate log if needed
  utils.rotateLogIfNeeded(decisionsPath);

  // Log this action
  utils.appendFileLocked(
    decisionsPath,
    '[' + timestamp + '] PreCompact: handoff.md updated automatically\n'
  );

  console.log('Handoff updated for task:', activeTask);

} catch (error) {
  // Log error properly
  try {
    const projectDir = utils.getProjectDir();
    utils.logError(projectDir, error, 'precompact.js');
  } catch (e) {
    console.error('PreCompact error:', error.message);
  }
  // Exit 0 to not block compact
  process.exit(0);
}
