#!/usr/bin/env node
/**
 * Task Analytics Dashboard
 * Generates statistics and insights from task history
 */

const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

/**
 * Parse task ID to get date
 */
function parseTaskDate(taskId) {
  const match = taskId.match(/^task_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
}

/**
 * Get task duration from decisions.log
 */
function getTaskDuration(taskPath) {
  const logPath = path.join(taskPath, 'decisions.log');
  if (!fs.existsSync(logPath)) return null;

  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) return null;

  // Parse first and last timestamps
  const firstMatch = lines[0].match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  const lastMatch = lines[lines.length - 1].match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);

  if (!firstMatch || !lastMatch) return null;

  const start = new Date(firstMatch[1].replace(' ', 'T'));
  const end = new Date(lastMatch[1].replace(' ', 'T'));

  return end - start; // milliseconds
}

/**
 * Get all tasks (active + archived)
 */
function getAllTasks(projectDir) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  const archiveDir = path.join(taskDir, 'archive');
  const tasks = [];

  // Get archived tasks
  if (fs.existsSync(archiveDir)) {
    const entries = fs.readdirSync(archiveDir);
    for (const entry of entries) {
      if (!utils.isValidTaskId(entry)) continue;
      const taskPath = path.join(archiveDir, entry);
      const stat = fs.statSync(taskPath);
      if (stat.isDirectory()) {
        tasks.push({ id: entry, path: taskPath, archived: true });
      }
    }
  }

  // Get active tasks
  const entries = fs.readdirSync(taskDir);
  for (const entry of entries) {
    if (entry === 'archive' || !utils.isValidTaskId(entry)) continue;
    const taskPath = path.join(taskDir, entry);
    const stat = fs.statSync(taskPath);
    if (stat.isDirectory()) {
      tasks.push({ id: entry, path: taskPath, archived: false });
    }
  }

  return tasks;
}

/**
 * Parse task metadata
 */
function parseTaskMetadata(task) {
  const date = parseTaskDate(task.id);
  if (!date) return null;

  let status = 'in_progress';
  let type = 'general';
  let goal = '';

  // Read checklist for status
  const checklistPath = path.join(task.path, 'checklist.md');
  if (fs.existsSync(checklistPath)) {
    const content = fs.readFileSync(checklistPath, 'utf8');
    if (content.includes('Status: COMPLETED')) status = 'completed';
    else if (content.includes('Status: ABANDONED')) status = 'abandoned';

    const templateMatch = content.match(/Template:\s*(\w+)/i);
    if (templateMatch) type = templateMatch[1].toLowerCase();
  }

  // Read plan for goal and type
  const planPath = path.join(task.path, 'plan.md');
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const goalMatch = content.match(/##\s*Goal\s*\n([^\n#]+)/);
    if (goalMatch) goal = goalMatch[1].trim();

    if (type === 'general') {
      const typeMatch = content.match(/##\s*Type\s*\n(\w+)/);
      if (typeMatch) type = typeMatch[1].toLowerCase();
    }
  }

  const duration = getTaskDuration(task.path);

  return {
    ...task,
    date,
    hour: date.getHours(),
    dayOfWeek: date.getDay(),
    status,
    type,
    goal,
    duration
  };
}

/**
 * Calculate analytics
 */
function calculateAnalytics(projectDir, days = 30) {
  const tasks = getAllTasks(projectDir);
  const parsedTasks = tasks.map(parseTaskMetadata).filter(t => t !== null);

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recentTasks = parsedTasks.filter(t => t.date >= cutoffDate);
  const completedRecent = recentTasks.filter(t => t.status === 'completed');

  // Productivity by hour
  const hourlyStats = {};
  for (let h = 0; h < 24; h++) hourlyStats[h] = 0;
  completedRecent.forEach(t => hourlyStats[t.hour]++);

  // Productivity by day of week
  const dayStats = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  completedRecent.forEach(t => dayStats[t.dayOfWeek]++);

  // Task types distribution
  const typeStats = {};
  completedRecent.forEach(t => {
    typeStats[t.type] = (typeStats[t.type] || 0) + 1;
  });

  // Duration stats
  const durations = completedRecent.filter(t => t.duration).map(t => t.duration);
  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Fastest and slowest
  const withDuration = completedRecent.filter(t => t.duration);
  const fastest = [...withDuration].sort((a, b) => a.duration - b.duration).slice(0, 3);
  const slowest = [...withDuration].sort((a, b) => b.duration - a.duration).slice(0, 3);

  return {
    period: `Last ${days} days`,
    summary: {
      completed: completedRecent.length,
      inProgress: recentTasks.filter(t => t.status === 'in_progress').length,
      abandoned: recentTasks.filter(t => t.status === 'abandoned').length,
      successRate: recentTasks.length > 0
        ? Math.round((completedRecent.length / recentTasks.length) * 100)
        : 0
    },
    avgDuration,
    hourlyStats,
    dayStats,
    typeStats,
    fastest,
    slowest,
    allTime: {
      total: parsedTasks.length,
      completed: parsedTasks.filter(t => t.status === 'completed').length
    }
  };
}

/**
 * Format duration for display
 */
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Create a horizontal bar
 */
function createBar(value, max, width = 12) {
  const filled = Math.round((value / max) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Format analytics for display
 */
function formatAnalytics(analytics) {
  let output = '\n📊 TASK ANALYTICS';
  output += ` (${analytics.period})\n`;
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Summary
  output += '📈 SUMMARY\n';
  output += `   Completed:    ${analytics.summary.completed} tasks\n`;
  output += `   In Progress:  ${analytics.summary.inProgress} tasks\n`;
  output += `   Abandoned:    ${analytics.summary.abandoned} tasks\n`;
  output += `   Success Rate: ${analytics.summary.successRate}%\n`;
  output += `   Avg Duration: ${formatDuration(analytics.avgDuration)}\n\n`;

  // Productivity hours
  const maxHour = Math.max(...Object.values(analytics.hourlyStats), 1);
  const topHours = Object.entries(analytics.hourlyStats)
    .sort((a, b) => b[1] - a[1])
    .filter(([, v]) => v > 0)
    .slice(0, 4);

  if (topHours.length > 0) {
    output += '🔥 MOST PRODUCTIVE HOURS\n';
    for (const [hour, count] of topHours) {
      const h = parseInt(hour);
      const timeStr = `${h.toString().padStart(2, '0')}:00-${((h + 1) % 24).toString().padStart(2, '0')}:00`;
      output += `   ${createBar(count, maxHour)} ${timeStr} (${count} tasks)\n`;
    }
    output += '\n';
  }

  // Day of week stats
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const maxDay = Math.max(...Object.values(analytics.dayStats), 1);

  output += '📅 PRODUCTIVITY BY DAY\n';
  for (let d = 1; d <= 6; d++) { // Mon-Sat
    output += `   ${dayNames[d]}: ${createBar(analytics.dayStats[d], maxDay, 8)} ${analytics.dayStats[d]}\n`;
  }
  output += `   ${dayNames[0]}: ${createBar(analytics.dayStats[0], maxDay, 8)} ${analytics.dayStats[0]}\n`;
  output += '\n';

  // Task types
  if (Object.keys(analytics.typeStats).length > 0) {
    output += '📦 TASK TYPES\n';
    const sortedTypes = Object.entries(analytics.typeStats)
      .sort((a, b) => b[1] - a[1]);
    for (const [type, count] of sortedTypes) {
      output += `   ${type}: ${count}\n`;
    }
    output += '\n';
  }

  // Fastest completions
  if (analytics.fastest.length > 0) {
    output += '⚡ FASTEST COMPLETIONS\n';
    for (const task of analytics.fastest) {
      const goal = task.goal.substring(0, 35) + (task.goal.length > 35 ? '...' : '');
      output += `   ${formatDuration(task.duration)} - "${goal}"\n`;
    }
    output += '\n';
  }

  // Slowest (if different from fastest)
  if (analytics.slowest.length > 0 && analytics.slowest[0].id !== analytics.fastest[0]?.id) {
    output += '🐌 LONGEST TASKS\n';
    for (const task of analytics.slowest) {
      const goal = task.goal.substring(0, 35) + (task.goal.length > 35 ? '...' : '');
      output += `   ${formatDuration(task.duration)} - "${goal}"\n`;
    }
    output += '\n';
  }

  // Recommendations
  output += '💡 RECOMMENDATIONS\n';
  if (analytics.avgDuration > 6 * 3600000) {
    output += '   • Break tasks > 6 hours into subtasks\n';
  }
  if (analytics.summary.abandoned > analytics.summary.completed * 0.2) {
    output += '   • High abandon rate - consider smaller task scopes\n';
  }
  if (analytics.summary.completed < 5) {
    output += '   • Complete more tasks to get better insights\n';
  }

  // All time stats
  output += '\n📜 ALL TIME\n';
  output += `   Total Tasks: ${analytics.allTime.total}\n`;
  output += `   Completed:   ${analytics.allTime.completed}\n`;

  return output;
}

/**
 * Save stats to file
 */
function saveStats(projectDir, analytics) {
  const statsPath = path.join(projectDir, '.claude', 'task', 'stats.json');

  const saveData = {
    lastUpdated: new Date().toISOString(),
    ...analytics
  };

  fs.writeFileSync(statsPath, JSON.stringify(saveData, null, 2));
}

// Main execution
if (require.main === module) {
  try {
    const projectDir = utils.getProjectDir();
    const days = parseInt(process.argv[2]) || 30;
    const analytics = calculateAnalytics(projectDir, days);

    // Save to file
    saveStats(projectDir, analytics);

    // Output formatted analytics
    console.log(formatAnalytics(analytics));

  } catch (error) {
    console.error('Error generating analytics:', error.message);
    process.exit(1);
  }
}

module.exports = {
  calculateAnalytics,
  formatAnalytics
};
