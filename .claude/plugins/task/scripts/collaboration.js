#!/usr/bin/env node
/**
 * Task Collaboration Manager
 * Share, import, and comment on tasks
 */

const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

/**
 * Export task for sharing
 */
function shareTask(projectDir, taskId) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  // Check archive if not found
  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const files = ['plan.md', 'checklist.md', 'handoff.md', 'decisions.log'];
  const taskData = {
    version: '1.0',
    taskId,
    exportedAt: new Date().toISOString(),
    files: {}
  };

  for (const file of files) {
    const filePath = path.join(taskPath, file);
    if (fs.existsSync(filePath)) {
      taskData.files[file] = fs.readFileSync(filePath, 'utf8');
    }
  }

  // Include dependencies if they exist
  const depsPath = path.join(taskPath, 'dependencies.json');
  if (fs.existsSync(depsPath)) {
    taskData.dependencies = JSON.parse(fs.readFileSync(depsPath, 'utf8'));
  }

  // Include comments if they exist
  const commentsPath = path.join(taskPath, 'comments.json');
  if (fs.existsSync(commentsPath)) {
    taskData.comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  }

  return taskData;
}

/**
 * Import a shared task
 */
function importTask(projectDir, taskData, newId = null) {
  if (!taskData.version || !taskData.files) {
    throw new Error('Invalid task file format');
  }

  const taskDir = path.join(projectDir, '.claude', 'task');

  // Generate new ID if not provided
  if (!newId) {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .slice(0, 15);
    newId = `task_${timestamp}`;
  }

  const taskPath = path.join(taskDir, newId);

  if (fs.existsSync(taskPath)) {
    throw new Error(`Task ID already exists: ${newId}`);
  }

  fs.mkdirSync(taskPath, { recursive: true });

  // Write files
  for (const [filename, content] of Object.entries(taskData.files)) {
    fs.writeFileSync(path.join(taskPath, filename), content);
  }

  // Add import note to decisions log
  const importNote = `[${new Date().toISOString()}] Imported from: ${taskData.taskId}\n` +
                     `[${new Date().toISOString()}] Original export date: ${taskData.exportedAt}\n`;

  const decisionsPath = path.join(taskPath, 'decisions.log');
  if (fs.existsSync(decisionsPath)) {
    const existing = fs.readFileSync(decisionsPath, 'utf8');
    fs.writeFileSync(decisionsPath, existing + '\n' + importNote);
  } else {
    fs.writeFileSync(decisionsPath, importNote);
  }

  // Import comments if present
  if (taskData.comments) {
    fs.writeFileSync(
      path.join(taskPath, 'comments.json'),
      JSON.stringify(taskData.comments, null, 2)
    );
  }

  return {
    newId,
    originalId: taskData.taskId,
    files: Object.keys(taskData.files)
  };
}

/**
 * Add a comment to a task
 */
function addComment(projectDir, taskId, author, message) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const commentsPath = path.join(taskPath, 'comments.json');
  let comments = { comments: [] };

  if (fs.existsSync(commentsPath)) {
    comments = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  }

  const comment = {
    id: Date.now().toString(36),
    author,
    message,
    timestamp: new Date().toISOString()
  };

  comments.comments.push(comment);

  fs.writeFileSync(commentsPath, JSON.stringify(comments, null, 2));

  // Also log to decisions
  utils.appendFileLocked(
    path.join(taskPath, 'decisions.log'),
    `[${comment.timestamp}] Comment by ${author}: ${message.substring(0, 100)}\n`
  );

  return comment;
}

/**
 * Get comments for a task
 */
function getComments(projectDir, taskId) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const commentsPath = path.join(taskPath, 'comments.json');

  if (!fs.existsSync(commentsPath)) {
    return [];
  }

  const data = JSON.parse(fs.readFileSync(commentsPath, 'utf8'));
  return data.comments || [];
}

/**
 * Format comments for display
 */
function formatComments(comments) {
  if (comments.length === 0) {
    return 'No comments yet.';
  }

  let output = '\n💬 COMMENTS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const comment of comments) {
    const date = new Date(comment.timestamp);
    const dateStr = date.toLocaleString();
    output += `@${comment.author} - ${dateStr}\n`;
    output += `${comment.message}\n\n`;
  }

  return output;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  try {
    const projectDir = utils.getProjectDir();

    switch (command) {
      case 'share':
        if (!args[1]) {
          console.error('Usage: collaboration.js share <task_id>');
          process.exit(1);
        }
        const taskData = shareTask(projectDir, args[1]);
        const outputPath = path.join(projectDir, `${args[1]}.task.json`);
        fs.writeFileSync(outputPath, JSON.stringify(taskData, null, 2));
        console.log(`\n✅ Task exported to: ${outputPath}`);
        console.log('\nShare this file with collaborators.');
        console.log('They can import with: /task-import <file>');
        break;

      case 'import':
        if (!args[1]) {
          console.error('Usage: collaboration.js import <file_path>');
          process.exit(1);
        }
        const importPath = args[1];
        if (!fs.existsSync(importPath)) {
          throw new Error(`File not found: ${importPath}`);
        }
        const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
        const result = importTask(projectDir, importData);
        console.log(`\n✅ Task imported: ${result.newId}`);
        console.log(`   Original: ${result.originalId}`);
        console.log(`   Files: ${result.files.join(', ')}`);
        console.log('\nUse /task-switch to switch to this task.');
        break;

      case 'comment':
        if (args.length < 4) {
          console.error('Usage: collaboration.js comment <task_id> <author> "<message>"');
          process.exit(1);
        }
        const comment = addComment(projectDir, args[1], args[2], args.slice(3).join(' '));
        console.log(`\n✅ Comment added by @${comment.author}`);
        break;

      case 'comments':
        if (!args[1]) {
          console.error('Usage: collaboration.js comments <task_id>');
          process.exit(1);
        }
        const comments = getComments(projectDir, args[1]);
        console.log(formatComments(comments));
        break;

      default:
        console.log('Usage: collaboration.js [share|import|comment|comments]');
        console.log('  share <task_id>                    - Export task for sharing');
        console.log('  import <file>                      - Import a shared task');
        console.log('  comment <task_id> <author> <msg>   - Add a comment');
        console.log('  comments <task_id>                 - View comments');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  shareTask,
  importTask,
  addComment,
  getComments
};
