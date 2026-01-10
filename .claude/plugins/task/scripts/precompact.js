const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

try {
  const projectDir = utils.getProjectDir();
  const taskDir = path.join(projectDir, '.claude', 'task');

  // Get active task (from CLAUDE.md or most recent valid)
  const activeTask = utils.getActiveTask(projectDir);

  if (!activeTask) {
    process.exit(0);
  }

  const taskPath = path.join(taskDir, activeTask);

  // Read current files
  const planPath = path.join(taskPath, 'plan.md');
  const checklistPath = path.join(taskPath, 'checklist.md');
  const decisionsPath = path.join(taskPath, 'decisions.log');
  const handoffPath = path.join(taskPath, 'handoff.md');

  const plan = fs.existsSync(planPath)
    ? fs.readFileSync(planPath, 'utf8')
    : '';
  const checklist = fs.existsSync(checklistPath)
    ? fs.readFileSync(checklistPath, 'utf8')
    : '';
  const decisions = fs.existsSync(decisionsPath)
    ? fs.readFileSync(decisionsPath, 'utf8')
    : '';

  // Backup existing handoff before overwriting
  utils.backupFile(handoffPath);

  // Generate handoff - include FULL plan, not truncated
  const timestamp = new Date().toISOString();
  const handoff = `# Handoff Notes

Generated: ${timestamp}
Task: ${activeTask}

## Plan
${plan}

## Checklist Status
${checklist}

## Recent Decisions (last 20)
${decisions.split('\n').slice(-20).join('\n')}

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
    `[${timestamp}] PreCompact: handoff.md updated automatically\n`
  );

  console.log('Handoff updated for task:', activeTask);

} catch (error) {
  // Log error properly instead of silent fail
  try {
    const projectDir = utils.getProjectDir();
    utils.logError(projectDir, error, 'precompact.js');
  } catch (e) {
    console.error('PreCompact error:', error.message);
  }
  process.exit(1);
}
