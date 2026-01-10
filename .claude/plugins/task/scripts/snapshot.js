#!/usr/bin/env node
/**
 * Task Snapshot Manager
 * Creates and restores snapshots of task state + code changes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const utils = require('./task-utils');

/**
 * Create a snapshot of the current task state
 */
function createSnapshot(projectDir, label = '') {
  const activeTask = utils.getActiveTask(projectDir);
  if (!activeTask) {
    throw new Error('No active task found');
  }

  const taskDir = path.join(projectDir, '.claude', 'task');
  const taskPath = utils.safePathJoin(taskDir, activeTask);
  const snapshotsDir = path.join(taskPath, 'snapshots');

  // Create snapshots directory
  if (!fs.existsSync(snapshotsDir)) {
    fs.mkdirSync(snapshotsDir, { recursive: true });
  }

  // Generate snapshot ID
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const snapshotId = `snap_${timestamp}`;
  const snapshotPath = path.join(snapshotsDir, snapshotId);

  fs.mkdirSync(snapshotPath);

  // Copy task files
  const taskFiles = ['plan.md', 'checklist.md', 'handoff.md', 'decisions.log'];
  for (const file of taskFiles) {
    const src = path.join(taskPath, file);
    const dst = path.join(snapshotPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // Create git stash for code changes
  let stashRef = null;
  try {
    // Check if there are changes to stash
    const status = execSync('git status --porcelain', {
      cwd: projectDir,
      encoding: 'utf8'
    }).trim();

    if (status) {
      // Create stash with message
      const stashMessage = `task-snapshot: ${snapshotId} - ${label || 'no label'}`;
      execSync(`git stash push -m "${stashMessage}" --include-untracked`, {
        cwd: projectDir,
        encoding: 'utf8'
      });

      // Get stash reference
      const stashList = execSync('git stash list', {
        cwd: projectDir,
        encoding: 'utf8'
      });

      const match = stashList.match(/stash@\{(\d+)\}.*task-snapshot: snap_/);
      if (match) {
        stashRef = `stash@{${match[1]}}`;
      }

      // Re-apply the stash to keep working
      execSync('git stash pop', {
        cwd: projectDir,
        encoding: 'utf8'
      });
    }
  } catch (error) {
    // Git operations are optional
    console.error('Git stash skipped:', error.message);
  }

  // Create manifest
  const manifest = {
    id: snapshotId,
    taskId: activeTask,
    label: label || null,
    createdAt: new Date().toISOString(),
    gitStash: stashRef,
    files: taskFiles.filter(f => fs.existsSync(path.join(snapshotPath, f)))
  };

  fs.writeFileSync(
    path.join(snapshotPath, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  // Update global manifest
  updateGlobalManifest(snapshotsDir, manifest);

  return manifest;
}

/**
 * Update the global snapshots manifest
 */
function updateGlobalManifest(snapshotsDir, newSnapshot) {
  const manifestPath = path.join(snapshotsDir, 'manifest.json');
  let manifest = { snapshots: [] };

  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {
      manifest = { snapshots: [] };
    }
  }

  manifest.snapshots.unshift({
    id: newSnapshot.id,
    label: newSnapshot.label,
    createdAt: newSnapshot.createdAt
  });

  // Keep max 20 snapshots in manifest
  manifest.snapshots = manifest.snapshots.slice(0, 20);

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * List all snapshots for active task
 */
function listSnapshots(projectDir) {
  const activeTask = utils.getActiveTask(projectDir);
  if (!activeTask) {
    throw new Error('No active task found');
  }

  const taskDir = path.join(projectDir, '.claude', 'task');
  const taskPath = utils.safePathJoin(taskDir, activeTask);
  const snapshotsDir = path.join(taskPath, 'snapshots');
  const manifestPath = path.join(snapshotsDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.snapshots || [];
}

/**
 * Restore a snapshot
 */
function restoreSnapshot(projectDir, snapshotId) {
  const activeTask = utils.getActiveTask(projectDir);
  if (!activeTask) {
    throw new Error('No active task found');
  }

  const taskDir = path.join(projectDir, '.claude', 'task');
  const taskPath = utils.safePathJoin(taskDir, activeTask);
  const snapshotsDir = path.join(taskPath, 'snapshots');
  const snapshotPath = path.join(snapshotsDir, snapshotId);

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const manifestPath = path.join(snapshotPath, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Invalid snapshot: missing manifest');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  // Backup current state before restore
  const backupId = createSnapshot(projectDir, 'auto-backup before restore');

  // Restore task files
  for (const file of manifest.files) {
    const src = path.join(snapshotPath, file);
    const dst = path.join(taskPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }

  // Log the restore
  utils.appendFileLocked(
    path.join(taskPath, 'decisions.log'),
    `[${new Date().toISOString()}] Restored from snapshot: ${snapshotId}\n`
  );

  return {
    restored: manifest,
    backup: backupId
  };
}

/**
 * Delete old snapshots, keeping the most recent N
 */
function cleanupSnapshots(projectDir, keepCount = 10) {
  const activeTask = utils.getActiveTask(projectDir);
  if (!activeTask) return 0;

  const taskDir = path.join(projectDir, '.claude', 'task');
  const taskPath = utils.safePathJoin(taskDir, activeTask);
  const snapshotsDir = path.join(taskPath, 'snapshots');

  if (!fs.existsSync(snapshotsDir)) return 0;

  const entries = fs.readdirSync(snapshotsDir)
    .filter(e => e.startsWith('snap_'))
    .sort()
    .reverse();

  let deleted = 0;
  for (let i = keepCount; i < entries.length; i++) {
    const snapshotPath = path.join(snapshotsDir, entries[i]);
    fs.rmSync(snapshotPath, { recursive: true, force: true });
    deleted++;
  }

  return deleted;
}

/**
 * Format snapshots list for display
 */
function formatSnapshots(snapshots) {
  if (snapshots.length === 0) {
    return 'No snapshots found for this task.\nUse /task-snapshot to create one.';
  }

  let output = '\n📸 TASK SNAPSHOTS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const snap of snapshots) {
    const date = new Date(snap.createdAt);
    const dateStr = date.toLocaleString();
    const label = snap.label ? ` - "${snap.label}"` : '';
    output += `📌 ${snap.id}${label}\n`;
    output += `   Created: ${dateStr}\n\n`;
  }

  output += 'To restore: /task-restore <snapshot_id>\n';

  return output;
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';

  try {
    const projectDir = utils.getProjectDir();

    switch (command) {
      case 'create':
        const label = args.slice(1).join(' ');
        const snapshot = createSnapshot(projectDir, label);
        console.log(`\n✅ Snapshot created: ${snapshot.id}`);
        if (snapshot.label) console.log(`   Label: "${snapshot.label}"`);
        console.log(`   Files: ${snapshot.files.join(', ')}`);
        break;

      case 'list':
        const snapshots = listSnapshots(projectDir);
        console.log(formatSnapshots(snapshots));
        break;

      case 'restore':
        if (!args[1]) {
          console.error('Usage: snapshot.js restore <snapshot_id>');
          process.exit(1);
        }
        const result = restoreSnapshot(projectDir, args[1]);
        console.log(`\n✅ Restored from: ${result.restored.id}`);
        console.log(`   Backup created: ${result.backup.id}`);
        break;

      case 'cleanup':
        const keepCount = parseInt(args[1]) || 10;
        const deleted = cleanupSnapshots(projectDir, keepCount);
        console.log(`Cleaned up ${deleted} old snapshots`);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Usage: snapshot.js [create|list|restore|cleanup]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
  cleanupSnapshots
};
