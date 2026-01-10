const fs = require('fs');
const path = require('path');

// Find project dir
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const taskDir = path.join(projectDir, '.claude', 'task');

// Find active task
if (!fs.existsSync(taskDir)) {
  process.exit(0);
}

const tasks = fs.readdirSync(taskDir).filter(f => 
  fs.statSync(path.join(taskDir, f)).isDirectory()
);

if (tasks.length === 0) {
  process.exit(0);
}

// Get most recent task
const activeTask = tasks.sort().reverse()[0];
const taskPath = path.join(taskDir, activeTask);

// Read current files
const plan = fs.existsSync(path.join(taskPath, 'plan.md')) 
  ? fs.readFileSync(path.join(taskPath, 'plan.md'), 'utf8') : '';
const checklist = fs.existsSync(path.join(taskPath, 'checklist.md'))
  ? fs.readFileSync(path.join(taskPath, 'checklist.md'), 'utf8') : '';
const decisions = fs.existsSync(path.join(taskPath, 'decisions.log'))
  ? fs.readFileSync(path.join(taskPath, 'decisions.log'), 'utf8') : '';

// Generate handoff
const timestamp = new Date().toISOString();
const handoff = `# Handoff Notes

Generated: ${timestamp}

## Plan Summary
${plan.split('\n').slice(0, 20).join('\n')}

## Checklist Status
${checklist}

## Recent Decisions
${decisions.split('\n').slice(-10).join('\n')}

## Next Actions
Continue from where this task left off.
`;

fs.writeFileSync(path.join(taskPath, 'handoff.md'), handoff);

// Log
fs.appendFileSync(
  path.join(taskPath, 'decisions.log'),
  `\n[${timestamp}] PreCompact: handoff.md updated automatically\n`
);

console.log('Handoff updated for task:', activeTask);