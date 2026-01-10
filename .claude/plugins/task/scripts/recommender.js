#!/usr/bin/env node
/**
 * AI Task Recommender
 * Analyzes patterns and suggests next tasks
 */

const fs = require('fs');
const path = require('path');
const utils = require('./task-utils');

/**
 * Common follow-up patterns
 */
const FOLLOW_UP_PATTERNS = {
  feature: [
    { next: 'Add tests for new feature', confidence: 95, reason: 'Features need test coverage' },
    { next: 'Update documentation', confidence: 85, reason: 'New features should be documented' },
    { next: 'Add error handling', confidence: 75, reason: 'Edge cases often missed initially' }
  ],
  bugfix: [
    { next: 'Add regression test', confidence: 90, reason: 'Prevent bug from recurring' },
    { next: 'Check related code for similar issues', confidence: 70, reason: 'Same bug pattern may exist elsewhere' },
    { next: 'Update error messages', confidence: 60, reason: 'Improve debugging for similar issues' }
  ],
  refactor: [
    { next: 'Run full test suite', confidence: 95, reason: 'Ensure no regressions' },
    { next: 'Update affected documentation', confidence: 80, reason: 'Code structure changed' },
    { next: 'Benchmark performance', confidence: 70, reason: 'Verify no performance regression' }
  ],
  hotfix: [
    { next: 'Create proper fix for next release', confidence: 90, reason: 'Hotfixes are temporary' },
    { next: 'Add monitoring/alerting', confidence: 85, reason: 'Detect if issue recurs' },
    { next: 'Post-mortem documentation', confidence: 75, reason: 'Learn from the incident' }
  ],
  research: [
    { next: 'Create proof of concept', confidence: 85, reason: 'Validate research findings' },
    { next: 'Document findings', confidence: 90, reason: 'Share knowledge with team' },
    { next: 'Present to stakeholders', confidence: 70, reason: 'Get buy-in for next steps' }
  ]
};

/**
 * Missing practice patterns
 */
const MISSING_PRACTICES = [
  { pattern: 'test', keywords: ['test', 'spec', 'coverage'], message: 'Consider adding tests' },
  { pattern: 'docs', keywords: ['doc', 'readme', 'comment'], message: 'Consider updating documentation' },
  { pattern: 'review', keywords: ['review', 'pr', 'feedback'], message: 'Consider code review' },
  { pattern: 'deploy', keywords: ['deploy', 'release', 'ship'], message: 'Consider deployment checklist' }
];

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
 * Get all completed tasks with metadata
 */
function getCompletedTasks(projectDir) {
  const archiveDir = path.join(projectDir, '.claude', 'task', 'archive');
  if (!fs.existsSync(archiveDir)) return [];

  const tasks = [];
  const entries = fs.readdirSync(archiveDir);

  for (const entry of entries) {
    if (!utils.isValidTaskId(entry)) continue;

    const taskPath = path.join(archiveDir, entry);
    const date = parseTaskDate(entry);
    if (!date) continue;

    let type = 'general';
    let goal = '';
    let decisions = '';

    // Read checklist for type
    const checklistPath = path.join(taskPath, 'checklist.md');
    if (fs.existsSync(checklistPath)) {
      const content = fs.readFileSync(checklistPath, 'utf8');
      const templateMatch = content.match(/Template:\s*(\w+)/i);
      if (templateMatch) type = templateMatch[1].toLowerCase();
    }

    // Read plan for goal
    const planPath = path.join(taskPath, 'plan.md');
    if (fs.existsSync(planPath)) {
      const content = fs.readFileSync(planPath, 'utf8');
      const goalMatch = content.match(/##\s*Goal\s*\n([^\n#]+)/);
      if (goalMatch) goal = goalMatch[1].trim();

      const typeMatch = content.match(/##\s*Type\s*\n(\w+)/);
      if (typeMatch && type === 'general') type = typeMatch[1].toLowerCase();
    }

    // Read decisions for context
    const decisionsPath = path.join(taskPath, 'decisions.log');
    if (fs.existsSync(decisionsPath)) {
      decisions = fs.readFileSync(decisionsPath, 'utf8');
    }

    tasks.push({
      id: entry,
      date,
      type,
      goal,
      decisions
    });
  }

  return tasks.sort((a, b) => b.date - a.date);
}

/**
 * Get active task info
 */
function getActiveTaskInfo(projectDir) {
  const activeTask = utils.getActiveTask(projectDir);
  if (!activeTask) return null;

  const taskDir = path.join(projectDir, '.claude', 'task');
  const taskPath = utils.safePathJoin(taskDir, activeTask);

  let type = 'general';
  let goal = '';
  let checklist = '';

  const checklistPath = path.join(taskPath, 'checklist.md');
  if (fs.existsSync(checklistPath)) {
    checklist = fs.readFileSync(checklistPath, 'utf8');
    const templateMatch = checklist.match(/Template:\s*(\w+)/i);
    if (templateMatch) type = templateMatch[1].toLowerCase();
  }

  const planPath = path.join(taskPath, 'plan.md');
  if (fs.existsSync(planPath)) {
    const content = fs.readFileSync(planPath, 'utf8');
    const goalMatch = content.match(/##\s*Goal\s*\n([^\n#]+)/);
    if (goalMatch) goal = goalMatch[1].trim();
  }

  return { id: activeTask, type, goal, checklist };
}

/**
 * Check for missing practices in task
 */
function checkMissingPractices(taskInfo, completedTasks) {
  const missing = [];
  const recentTasks = completedTasks.slice(0, 10);

  for (const practice of MISSING_PRACTICES) {
    // Check if this practice was done in current task
    const inCurrentTask = practice.keywords.some(kw =>
      taskInfo.checklist.toLowerCase().includes(kw) ||
      taskInfo.goal.toLowerCase().includes(kw)
    );

    if (!inCurrentTask) {
      // Check how often it was skipped in recent tasks
      let skippedCount = 0;
      for (const task of recentTasks) {
        const hadPractice = practice.keywords.some(kw =>
          task.decisions.toLowerCase().includes(kw)
        );
        if (!hadPractice) skippedCount++;
      }

      if (skippedCount >= 3) {
        missing.push({
          practice: practice.pattern,
          message: practice.message,
          skippedRecently: skippedCount
        });
      }
    }
  }

  return missing;
}

/**
 * Generate recommendations
 */
function generateRecommendations(projectDir) {
  const completedTasks = getCompletedTasks(projectDir);
  const activeTask = getActiveTaskInfo(projectDir);

  const recommendations = [];

  // Pattern-based follow-up suggestions
  if (activeTask && FOLLOW_UP_PATTERNS[activeTask.type]) {
    const patterns = FOLLOW_UP_PATTERNS[activeTask.type];
    for (const pattern of patterns) {
      recommendations.push({
        suggestion: pattern.next,
        confidence: pattern.confidence,
        reason: pattern.reason,
        type: 'follow-up'
      });
    }
  }

  // Missing practices
  if (activeTask) {
    const missing = checkMissingPractices(activeTask, completedTasks);
    for (const practice of missing) {
      recommendations.push({
        suggestion: practice.message,
        confidence: 60 + (practice.skippedRecently * 5),
        reason: `Skipped in ${practice.skippedRecently} of last 10 tasks`,
        type: 'missing-practice'
      });
    }
  }

  // Recent task patterns
  if (completedTasks.length >= 3) {
    const recentTypes = completedTasks.slice(0, 5).map(t => t.type);
    const typeCounts = {};
    recentTypes.forEach(t => typeCounts[t] = (typeCounts[t] || 0) + 1);

    // If doing lots of bugfixes, suggest refactoring
    if ((typeCounts.bugfix || 0) >= 3) {
      recommendations.push({
        suggestion: 'Consider refactoring - many recent bugfixes in same area',
        confidence: 75,
        reason: '3+ bugfixes recently may indicate code quality issues',
        type: 'trend-analysis'
      });
    }

    // If no tests recently, suggest adding tests
    const hasTestRecently = completedTasks.slice(0, 5).some(t =>
      t.goal.toLowerCase().includes('test') ||
      t.decisions.toLowerCase().includes('test')
    );
    if (!hasTestRecently) {
      recommendations.push({
        suggestion: 'Add test coverage to recent changes',
        confidence: 80,
        reason: 'No testing tasks in last 5 completions',
        type: 'trend-analysis'
      });
    }
  }

  // Sort by confidence
  return recommendations.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Format recommendations for display
 */
function formatRecommendations(recommendations, activeTask) {
  let output = '\n🤖 SUGGESTED NEXT TASKS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  if (activeTask) {
    output += `Current task: "${activeTask.goal}"\n`;
    output += `Type: ${activeTask.type}\n\n`;
  }

  if (recommendations.length === 0) {
    output += 'No specific recommendations. Keep up the good work!\n';
    return output;
  }

  const topRecs = recommendations.slice(0, 5);

  for (let i = 0; i < topRecs.length; i++) {
    const rec = topRecs[i];
    const confidenceBar = '█'.repeat(Math.round(rec.confidence / 10)) +
                         '░'.repeat(10 - Math.round(rec.confidence / 10));

    output += `${i + 1}. ${rec.suggestion} (${rec.confidence}% match)\n`;
    output += `   ${confidenceBar}\n`;
    output += `   Reason: ${rec.reason}\n\n`;
  }

  // Tips based on type
  output += '💡 TIPS\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  const typeIcons = {
    'follow-up': '🔄',
    'missing-practice': '⚠️',
    'trend-analysis': '📊'
  };

  const typeLabels = {
    'follow-up': 'Based on task type patterns',
    'missing-practice': 'Commonly skipped practices',
    'trend-analysis': 'Based on recent work trends'
  };

  const types = [...new Set(topRecs.map(r => r.type))];
  for (const type of types) {
    output += `${typeIcons[type] || '•'} ${typeLabels[type] || type}\n`;
  }

  return output;
}

// Main execution
if (require.main === module) {
  try {
    const projectDir = utils.getProjectDir();
    const activeTask = getActiveTaskInfo(projectDir);
    const recommendations = generateRecommendations(projectDir);

    console.log(formatRecommendations(recommendations, activeTask));

  } catch (error) {
    console.error('Error generating recommendations:', error.message);
    process.exit(1);
  }
}

module.exports = {
  generateRecommendations,
  formatRecommendations,
  FOLLOW_UP_PATTERNS
};
