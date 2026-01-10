#!/usr/bin/env node
/**
 * Achievements Calculator
 * Calculates streaks, badges, and milestones from task history
 */

const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

// Achievement definitions
const ACHIEVEMENTS = {
  streak: {
    name: 'Streak',
    icon: '🔥',
    levels: [3, 7, 14, 30],
    description: 'Complete tasks X days in a row'
  },
  speedDemon: {
    name: 'Speed Demon',
    icon: '⚡',
    levels: [3, 5, 10],
    description: 'Complete X tasks in a single day'
  },
  centurion: {
    name: 'Centurion',
    icon: '🏆',
    levels: [10, 25, 50, 100],
    description: 'Complete X tasks total'
  },
  nightOwl: {
    name: 'Night Owl',
    icon: '🌙',
    levels: [5, 15, 30],
    description: 'Complete X tasks after 10 PM'
  },
  earlyBird: {
    name: 'Early Bird',
    icon: '🌅',
    levels: [5, 15, 30],
    description: 'Complete X tasks before 8 AM'
  },
  bugHunter: {
    name: 'Bug Hunter',
    icon: '🐛',
    levels: [5, 20, 50],
    description: 'Complete X bugfix tasks'
  },
  architect: {
    name: 'Architect',
    icon: '🏗️',
    levels: [5, 15, 30],
    description: 'Complete X feature tasks'
  },
  perfectionist: {
    name: 'Perfectionist',
    icon: '🎯',
    levels: [5, 10, 25],
    description: 'Complete X tasks without abandoning'
  }
};

/**
 * Parse task ID to get date
 * Format: task_YYYYMMDD_HHMMSS
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
 * Get all completed tasks from archive
 */
function getCompletedTasks(projectDir) {
  const archiveDir = path.join(projectDir, '.claude', 'task', 'archive');

  if (!fs.existsSync(archiveDir)) {
    return [];
  }

  const tasks = [];
  const entries = fs.readdirSync(archiveDir);

  for (const entry of entries) {
    if (!utils.isValidTaskId(entry)) continue;

    const taskPath = path.join(archiveDir, entry);
    const stat = fs.statSync(taskPath);

    if (!stat.isDirectory()) continue;

    const checklistPath = path.join(taskPath, 'checklist.md');
    const planPath = path.join(taskPath, 'plan.md');

    let type = 'unknown';
    let status = 'unknown';

    // Read checklist for status
    if (fs.existsSync(checklistPath)) {
      const content = fs.readFileSync(checklistPath, 'utf8');
      if (content.includes('Status: COMPLETED')) {
        status = 'completed';
      } else if (content.includes('Status: ABANDONED')) {
        status = 'abandoned';
      }

      // Check for template type
      const templateMatch = content.match(/Template:\s*(\w+)/);
      if (templateMatch) {
        type = templateMatch[1].toLowerCase();
      }
    }

    // Read plan for type if not found
    if (type === 'unknown' && fs.existsSync(planPath)) {
      const content = fs.readFileSync(planPath, 'utf8');
      const typeMatch = content.match(/##\s*Type\s*\n(\w+)/);
      if (typeMatch) {
        type = typeMatch[1].toLowerCase();
      }
    }

    const date = parseTaskDate(entry);
    if (date) {
      tasks.push({
        id: entry,
        date,
        type,
        status,
        hour: date.getHours()
      });
    }
  }

  return tasks.sort((a, b) => b.date - a.date);
}

/**
 * Calculate current streak
 */
function calculateStreak(tasks) {
  if (tasks.length === 0) return 0;

  const completedTasks = tasks.filter(t => t.status === 'completed');
  if (completedTasks.length === 0) return 0;

  // Get unique days with completed tasks
  const days = new Set();
  completedTasks.forEach(t => {
    days.add(t.date.toISOString().split('T')[0]);
  });

  const sortedDays = Array.from(days).sort().reverse();
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  // Check if streak is active (completed today or yesterday)
  if (sortedDays[0] !== today && sortedDays[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const current = new Date(sortedDays[i - 1]);
    const prev = new Date(sortedDays[i]);
    const diffDays = (current - prev) / 86400000;

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate max tasks in a single day
 */
function calculateMaxDailyTasks(tasks) {
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const dayCounts = {};

  completedTasks.forEach(t => {
    const day = t.date.toISOString().split('T')[0];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  });

  return Math.max(0, ...Object.values(dayCounts));
}

/**
 * Get achievement level based on value
 */
function getAchievementLevel(achievement, value) {
  const levels = ACHIEVEMENTS[achievement].levels;
  let level = 0;

  for (let i = 0; i < levels.length; i++) {
    if (value >= levels[i]) {
      level = i + 1;
    }
  }

  return {
    level,
    current: value,
    next: levels[level] || null,
    maxLevel: levels.length
  };
}

/**
 * Calculate all achievements
 */
function calculateAchievements(projectDir) {
  const tasks = getCompletedTasks(projectDir);
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const stats = {
    totalTasks: completedTasks.length,
    abandonedTasks: tasks.filter(t => t.status === 'abandoned').length,
    streak: calculateStreak(tasks),
    maxDailyTasks: calculateMaxDailyTasks(tasks),
    nightTasks: completedTasks.filter(t => t.hour >= 22 || t.hour < 4).length,
    morningTasks: completedTasks.filter(t => t.hour >= 4 && t.hour < 8).length,
    bugfixTasks: completedTasks.filter(t => t.type === 'bugfix').length,
    featureTasks: completedTasks.filter(t => t.type === 'feature').length
  };

  const achievements = {
    streak: {
      ...ACHIEVEMENTS.streak,
      ...getAchievementLevel('streak', stats.streak),
      active: stats.streak > 0
    },
    speedDemon: {
      ...ACHIEVEMENTS.speedDemon,
      ...getAchievementLevel('speedDemon', stats.maxDailyTasks)
    },
    centurion: {
      ...ACHIEVEMENTS.centurion,
      ...getAchievementLevel('centurion', stats.totalTasks)
    },
    nightOwl: {
      ...ACHIEVEMENTS.nightOwl,
      ...getAchievementLevel('nightOwl', stats.nightTasks)
    },
    earlyBird: {
      ...ACHIEVEMENTS.earlyBird,
      ...getAchievementLevel('earlyBird', stats.morningTasks)
    },
    bugHunter: {
      ...ACHIEVEMENTS.bugHunter,
      ...getAchievementLevel('bugHunter', stats.bugfixTasks)
    },
    architect: {
      ...ACHIEVEMENTS.architect,
      ...getAchievementLevel('architect', stats.featureTasks)
    },
    perfectionist: {
      ...ACHIEVEMENTS.perfectionist,
      ...getAchievementLevel('perfectionist', stats.totalTasks - stats.abandonedTasks)
    }
  };

  return { stats, achievements };
}

/**
 * Format achievements for display
 */
function formatAchievements(data) {
  const { stats, achievements } = data;

  let output = '\n🏆 YOUR ACHIEVEMENTS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  // Active achievements
  const earned = Object.entries(achievements)
    .filter(([, a]) => a.level > 0)
    .sort((a, b) => b[1].level - a[1].level);

  if (earned.length === 0) {
    output += 'No achievements yet. Complete some tasks to earn badges!\n';
  } else {
    for (const [key, achievement] of earned) {
      const stars = '★'.repeat(achievement.level) + '☆'.repeat(achievement.maxLevel - achievement.level);
      output += `${achievement.icon} ${achievement.name} [${stars}]\n`;
      output += `   ${achievement.current} / ${achievement.next || 'MAX'} - ${achievement.description}\n\n`;
    }
  }

  // Streak highlight
  if (stats.streak > 0) {
    output += `\n🔥 ACTIVE STREAK: ${stats.streak} days!\n`;
  }

  // Next milestones
  output += '\n📈 NEXT MILESTONES\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  const upcoming = Object.entries(achievements)
    .filter(([, a]) => a.next !== null)
    .sort((a, b) => (b[1].current / b[1].next) - (a[1].current / a[1].next))
    .slice(0, 3);

  for (const [key, achievement] of upcoming) {
    const progress = Math.round((achievement.current / achievement.next) * 10);
    const bar = '▓'.repeat(progress) + '░'.repeat(10 - progress);
    output += `${achievement.icon} ${achievement.name}: ${bar} ${achievement.current}/${achievement.next}\n`;
  }

  // Stats summary
  output += '\n📊 STATS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  output += `Total Completed: ${stats.totalTasks}\n`;
  output += `Abandoned: ${stats.abandonedTasks}\n`;
  output += `Success Rate: ${stats.totalTasks > 0 ? Math.round((stats.totalTasks / (stats.totalTasks + stats.abandonedTasks)) * 100) : 0}%\n`;

  return output;
}

/**
 * Save achievements to file
 */
function saveAchievements(projectDir, data) {
  const achievementsPath = path.join(projectDir, '.claude', 'task', 'achievements.json');

  const saveData = {
    lastUpdated: new Date().toISOString(),
    ...data
  };

  fs.writeFileSync(achievementsPath, JSON.stringify(saveData, null, 2));
}

// Main execution
if (require.main === module) {
  try {
    const projectDir = utils.getProjectDir();
    const data = calculateAchievements(projectDir);

    // Save to file
    saveAchievements(projectDir, data);

    // Output formatted achievements
    console.log(formatAchievements(data));

  } catch (error) {
    console.error('Error calculating achievements:', error.message);
    process.exit(1);
  }
}

module.exports = {
  calculateAchievements,
  formatAchievements,
  ACHIEVEMENTS
};
