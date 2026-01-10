#!/usr/bin/env node
/**
 * Task Dependencies Manager
 * Manages parent-child relationships and dependencies between tasks
 */

const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

/**
 * Get dependencies file path for a task
 */
function getDepsPath(taskPath) {
  return path.join(taskPath, 'dependencies.json');
}

/**
 * Load dependencies for a task
 */
function loadDependencies(taskPath) {
  const depsPath = getDepsPath(taskPath);
  if (!fs.existsSync(depsPath)) {
    return {
      parent: null,
      children: [],
      blockedBy: [],
      blocks: []
    };
  }
  return JSON.parse(fs.readFileSync(depsPath, 'utf8'));
}

/**
 * Save dependencies for a task
 */
function saveDependencies(taskPath, deps) {
  const depsPath = getDepsPath(taskPath);
  fs.writeFileSync(depsPath, JSON.stringify(deps, null, 2));
}

/**
 * Create a subtask linked to parent
 */
function createSubtask(projectDir, parentId, subtaskGoal) {
  const taskDir = path.join(projectDir, '.claude', 'task');

  // Validate parent exists
  const parentPath = utils.safePathJoin(taskDir, parentId);
  if (!fs.existsSync(parentPath)) {
    // Check archive
    const archivePath = path.join(taskDir, 'archive', parentId);
    if (!fs.existsSync(archivePath)) {
      throw new Error(`Parent task not found: ${parentId}`);
    }
  }

  // Generate subtask ID
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '_')
    .slice(0, 15);
  const subtaskId = `task_${timestamp}`;

  // Create subtask directory
  const subtaskPath = path.join(taskDir, subtaskId);
  fs.mkdirSync(subtaskPath, { recursive: true });

  // Create subtask files
  fs.writeFileSync(path.join(subtaskPath, 'plan.md'), `# Task Plan

## Parent Task
${parentId}

## Goal
${subtaskGoal}

## Approach
[To be defined]

## Success Criteria
[To be defined]
`);

  fs.writeFileSync(path.join(subtaskPath, 'checklist.md'), `# Task Checklist

## Status: IN_PROGRESS
## Parent: ${parentId}

- [ ] Define approach
- [ ] Complete subtask
- [ ] Report back to parent
`);

  fs.writeFileSync(path.join(subtaskPath, 'handoff.md'), `# Handoff Notes

## Current State
Subtask of ${parentId}. Just started.

## Next Actions
[To be updated]
`);

  fs.writeFileSync(path.join(subtaskPath, 'decisions.log'),
    `[${now.toISOString()}] Subtask created with goal: ${subtaskGoal}\n` +
    `[${now.toISOString()}] Parent task: ${parentId}\n`
  );

  // Set up dependencies
  const subtaskDeps = {
    parent: parentId,
    children: [],
    blockedBy: [],
    blocks: []
  };
  saveDependencies(subtaskPath, subtaskDeps);

  // Update parent's dependencies
  const parentDeps = loadDependencies(parentPath);
  parentDeps.children.push(subtaskId);
  saveDependencies(parentPath, parentDeps);

  return {
    id: subtaskId,
    parentId,
    goal: subtaskGoal
  };
}

/**
 * Mark a task as blocking another
 */
function addBlocker(projectDir, blockerId, blockedId) {
  const taskDir = path.join(projectDir, '.claude', 'task');

  const blockerPath = utils.safePathJoin(taskDir, blockerId);
  const blockedPath = utils.safePathJoin(taskDir, blockedId);

  // Validate both exist
  if (!fs.existsSync(blockerPath) && !fs.existsSync(path.join(taskDir, 'archive', blockerId))) {
    throw new Error(`Blocker task not found: ${blockerId}`);
  }
  if (!fs.existsSync(blockedPath) && !fs.existsSync(path.join(taskDir, 'archive', blockedId))) {
    throw new Error(`Blocked task not found: ${blockedId}`);
  }

  // Update blocker
  const blockerDeps = loadDependencies(blockerPath);
  if (!blockerDeps.blocks.includes(blockedId)) {
    blockerDeps.blocks.push(blockedId);
    saveDependencies(blockerPath, blockerDeps);
  }

  // Update blocked
  const blockedDeps = loadDependencies(blockedPath);
  if (!blockedDeps.blockedBy.includes(blockerId)) {
    blockedDeps.blockedBy.push(blockerId);
    saveDependencies(blockedPath, blockedDeps);
  }

  return { blockerId, blockedId };
}

/**
 * Get task status
 */
function getTaskStatus(taskPath) {
  const checklistPath = path.join(taskPath, 'checklist.md');
  if (!fs.existsSync(checklistPath)) return 'unknown';

  const content = fs.readFileSync(checklistPath, 'utf8');
  if (content.includes('Status: COMPLETED')) return 'completed';
  if (content.includes('Status: ABANDONED')) return 'abandoned';
  return 'in_progress';
}

/**
 * Get task goal
 */
function getTaskGoal(taskPath) {
  const planPath = path.join(taskPath, 'plan.md');
  if (!fs.existsSync(planPath)) return 'Unknown';

  const content = fs.readFileSync(planPath, 'utf8');
  const match = content.match(/##\s*Goal\s*\n([^\n#]+)/);
  return match ? match[1].trim() : 'Unknown';
}

/**
 * Build dependency tree for a task
 */
function buildTree(projectDir, taskId, depth = 0, visited = new Set()) {
  if (visited.has(taskId)) return null; // Prevent cycles
  visited.add(taskId);

  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  // Check archive if not in active
  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
    if (!fs.existsSync(taskPath)) return null;
  }

  const deps = loadDependencies(taskPath);
  const status = getTaskStatus(taskPath);
  const goal = getTaskGoal(taskPath);

  const node = {
    id: taskId,
    goal: goal.substring(0, 50) + (goal.length > 50 ? '...' : ''),
    status,
    depth,
    children: [],
    blockedBy: deps.blockedBy
  };

  // Recursively build children
  for (const childId of deps.children) {
    const childNode = buildTree(projectDir, childId, depth + 1, visited);
    if (childNode) {
      node.children.push(childNode);
    }
  }

  return node;
}

/**
 * Format tree for display
 */
function formatTree(node, prefix = '', isLast = true) {
  if (!node) return '';

  const statusIcons = {
    completed: '\u2705',
    in_progress: '\u23F3',
    abandoned: '\u274C',
    unknown: '\u2753'
  };

  const connector = isLast ? '\u2514\u2500\u2500 ' : '\u251C\u2500\u2500 ';
  const extension = isLast ? '    ' : '\u2502   ';

  let output = '';
  if (node.depth === 0) {
    output += `${statusIcons[node.status]} ${node.id}\n`;
    output += `   "${node.goal}"\n`;
  } else {
    output += `${prefix}${connector}${statusIcons[node.status]} ${node.id}\n`;
    output += `${prefix}${extension}"${node.goal}"\n`;
  }

  // Show blockers
  if (node.blockedBy.length > 0) {
    const blockerPrefix = node.depth === 0 ? '   ' : prefix + extension;
    output += `${blockerPrefix}\u26A0\uFE0F Blocked by: ${node.blockedBy.join(', ')}\n`;
  }

  // Children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    const childIsLast = i === node.children.length - 1;
    const childPrefix = node.depth === 0 ? '   ' : prefix + extension;
    output += formatTree(child, childPrefix, childIsLast);
  }

  return output;
}

/**
 * Get full tree starting from root
 */
function getFullTree(projectDir, taskId) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
  }

  // Find root parent
  let currentId = taskId;
  let currentPath = taskPath;
  let deps = loadDependencies(currentPath);

  while (deps.parent) {
    currentId = deps.parent;
    currentPath = utils.safePathJoin(taskDir, currentId);
    if (!fs.existsSync(currentPath)) {
      currentPath = path.join(taskDir, 'archive', currentId);
    }
    if (!fs.existsSync(currentPath)) break;
    deps = loadDependencies(currentPath);
  }

  return buildTree(projectDir, currentId);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'tree';

  try {
    const projectDir = utils.getProjectDir();

    switch (command) {
      case 'subtask':
        if (args.length < 3) {
          console.error('Usage: dependencies.js subtask <parent_id> "<goal>"');
          process.exit(1);
        }
        const result = createSubtask(projectDir, args[1], args.slice(2).join(' '));
        console.log(`\n\u2705 Subtask created: ${result.id}`);
        console.log(`   Parent: ${result.parentId}`);
        console.log(`   Goal: ${result.goal}`);
        break;

      case 'block':
        if (args.length < 3) {
          console.error('Usage: dependencies.js block <blocker_id> <blocked_id>');
          process.exit(1);
        }
        const block = addBlocker(projectDir, args[1], args[2]);
        console.log(`\n\u2705 ${block.blockerId} now blocks ${block.blockedId}`);
        break;

      case 'tree':
        const activeTask = args[1] || utils.getActiveTask(projectDir);
        if (!activeTask) {
          console.error('No active task. Specify a task ID.');
          process.exit(1);
        }
        const tree = getFullTree(projectDir, activeTask);
        if (tree) {
          console.log('\n\uD83C\uDF33 TASK TREE\n');
          console.log(formatTree(tree));
        } else {
          console.log('No tree found for this task.');
        }
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Usage: dependencies.js [subtask|block|tree]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  createSubtask,
  addBlocker,
  buildTree,
  getFullTree,
  loadDependencies,
  saveDependencies
};
