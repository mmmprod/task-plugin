#!/usr/bin/env node
/**
 * Task Export & Portfolio Generator
 * Exports tasks to various formats
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

  const firstMatch = lines[0].match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  const lastMatch = lines[lines.length - 1].match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);

  if (!firstMatch || !lastMatch) return null;

  const start = new Date(firstMatch[1].replace(' ', 'T'));
  const end = new Date(lastMatch[1].replace(' ', 'T'));

  return end - start;
}

/**
 * Format duration for display
 */
function formatDuration(ms) {
  if (!ms) return 'N/A';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/**
 * Get all tasks with full metadata
 */
function getAllTasks(projectDir) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  const archiveDir = path.join(taskDir, 'archive');
  const tasks = [];

  // Helper to process task
  const processTask = (taskPath, id, archived) => {
    const date = parseTaskDate(id);
    if (!date) return null;

    let status = 'in_progress';
    let type = 'general';
    let goal = '';
    let approach = '';
    let successCriteria = '';

    const checklistPath = path.join(taskPath, 'checklist.md');
    if (fs.existsSync(checklistPath)) {
      const content = fs.readFileSync(checklistPath, 'utf8');
      if (content.includes('Status: COMPLETED')) status = 'completed';
      else if (content.includes('Status: ABANDONED')) status = 'abandoned';

      const templateMatch = content.match(/Template:\s*(\w+)/i);
      if (templateMatch) type = templateMatch[1].toLowerCase();
    }

    const planPath = path.join(taskPath, 'plan.md');
    if (fs.existsSync(planPath)) {
      const content = fs.readFileSync(planPath, 'utf8');

      const goalMatch = content.match(/##\s*Goal\s*\n([\s\S]*?)(?=\n##|$)/);
      if (goalMatch) goal = goalMatch[1].trim();

      const approachMatch = content.match(/##\s*Approach\s*\n([\s\S]*?)(?=\n##|$)/);
      if (approachMatch) approach = approachMatch[1].trim();

      const criteriaMatch = content.match(/##\s*Success Criteria\s*\n([\s\S]*?)(?=\n##|$)/);
      if (criteriaMatch) successCriteria = criteriaMatch[1].trim();

      const typeMatch = content.match(/##\s*Type\s*\n(\w+)/);
      if (typeMatch && type === 'general') type = typeMatch[1].toLowerCase();
    }

    const duration = getTaskDuration(taskPath);

    return {
      id,
      date,
      dateStr: date.toISOString().split('T')[0],
      status,
      type,
      goal,
      approach,
      successCriteria,
      duration,
      durationStr: formatDuration(duration),
      archived
    };
  };

  // Get archived tasks
  if (fs.existsSync(archiveDir)) {
    const entries = fs.readdirSync(archiveDir);
    for (const entry of entries) {
      if (!utils.isValidTaskId(entry)) continue;
      const taskPath = path.join(archiveDir, entry);
      if (fs.statSync(taskPath).isDirectory()) {
        const task = processTask(taskPath, entry, true);
        if (task) tasks.push(task);
      }
    }
  }

  // Get active tasks
  const entries = fs.readdirSync(taskDir);
  for (const entry of entries) {
    if (entry === 'archive' || !utils.isValidTaskId(entry)) continue;
    const taskPath = path.join(taskDir, entry);
    if (fs.statSync(taskPath).isDirectory()) {
      const task = processTask(taskPath, entry, false);
      if (task) tasks.push(task);
    }
  }

  return tasks.sort((a, b) => b.date - a.date);
}

/**
 * Export to JSON
 */
function exportToJson(tasks) {
  return JSON.stringify(tasks, null, 2);
}

/**
 * Export single task to JSON
 */
function exportTaskToJson(projectDir, taskId) {
  const taskDir = path.join(projectDir, '.claude', 'task');
  let taskPath = utils.safePathJoin(taskDir, taskId);

  if (!fs.existsSync(taskPath)) {
    taskPath = path.join(taskDir, 'archive', taskId);
  }

  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const files = ['plan.md', 'checklist.md', 'handoff.md', 'decisions.log'];
  const data = { id: taskId };

  for (const file of files) {
    const filePath = path.join(taskPath, file);
    if (fs.existsSync(filePath)) {
      data[file.replace('.md', '').replace('.log', '')] = fs.readFileSync(filePath, 'utf8');
    }
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Generate HTML portfolio
 */
function generatePortfolio(tasks, projectName = 'My Projects') {
  const completedTasks = tasks.filter(t => t.status === 'completed');

  // Group by month
  const byMonth = {};
  completedTasks.forEach(t => {
    const monthKey = t.date.toISOString().slice(0, 7);
    if (!byMonth[monthKey]) byMonth[monthKey] = [];
    byMonth[monthKey].push(t);
  });

  // Calculate stats
  const totalDuration = completedTasks
    .filter(t => t.duration)
    .reduce((sum, t) => sum + t.duration, 0);

  const typeStats = {};
  completedTasks.forEach(t => {
    typeStats[t.type] = (typeStats[t.type] || 0) + 1;
  });

  const topSkills = Object.entries(typeStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Generate HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} - Developer Portfolio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
    }
    .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 3rem 2rem;
      text-align: center;
    }
    header h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    header p { opacity: 0.9; }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 2rem 0;
    }
    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      text-align: center;
    }
    .stat-card h3 { font-size: 2rem; color: #667eea; }
    .stat-card p { color: #666; }
    .skills {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .skill-bar {
      display: flex;
      align-items: center;
      margin: 0.5rem 0;
    }
    .skill-name { width: 120px; font-weight: 500; }
    .skill-progress {
      flex: 1;
      height: 20px;
      background: #eee;
      border-radius: 10px;
      overflow: hidden;
    }
    .skill-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      border-radius: 10px;
    }
    .skill-count { width: 50px; text-align: right; color: #666; }
    .projects { margin-top: 2rem; }
    .month-group { margin-bottom: 2rem; }
    .month-group h2 {
      font-size: 1.2rem;
      color: #667eea;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #667eea;
    }
    .project-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.5rem;
    }
    .project-title { font-size: 1.1rem; font-weight: 600; }
    .project-meta {
      display: flex;
      gap: 1rem;
      color: #666;
      font-size: 0.9rem;
    }
    .project-type {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      background: #667eea;
      color: white;
      border-radius: 20px;
      font-size: 0.8rem;
    }
    .project-description { color: #555; margin-top: 0.5rem; }
    footer {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    footer a { color: #667eea; }
  </style>
</head>
<body>
  <header>
    <h1>${projectName}</h1>
    <p>Developer Portfolio - Generated with Claude Code Task Plugin</p>
  </header>

  <div class="container">
    <div class="stats">
      <div class="stat-card">
        <h3>${completedTasks.length}</h3>
        <p>Projects Completed</p>
      </div>
      <div class="stat-card">
        <h3>${formatDuration(totalDuration)}</h3>
        <p>Total Development Time</p>
      </div>
      <div class="stat-card">
        <h3>${Object.keys(typeStats).length}</h3>
        <p>Skill Areas</p>
      </div>
    </div>

    <div class="skills">
      <h2>Skills & Expertise</h2>
      ${topSkills.map(([skill, count]) => {
        const maxCount = topSkills[0][1];
        const percent = (count / maxCount) * 100;
        return `
        <div class="skill-bar">
          <span class="skill-name">${skill}</span>
          <div class="skill-progress">
            <div class="skill-fill" style="width: ${percent}%"></div>
          </div>
          <span class="skill-count">${count}</span>
        </div>`;
      }).join('')}
    </div>

    <div class="projects">
      <h2>Completed Projects</h2>
      ${Object.entries(byMonth)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([month, monthTasks]) => {
          const monthDate = new Date(month + '-01');
          const monthName = monthDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
          return `
          <div class="month-group">
            <h2>${monthName}</h2>
            ${monthTasks.map(task => `
            <div class="project-card">
              <div class="project-header">
                <span class="project-title">${escapeHtml(task.goal)}</span>
                <span class="project-type">${task.type}</span>
              </div>
              <div class="project-meta">
                <span>📅 ${task.dateStr}</span>
                <span>⏱️ ${task.durationStr}</span>
              </div>
              ${task.approach ? `<p class="project-description">${escapeHtml(task.approach.substring(0, 200))}${task.approach.length > 200 ? '...' : ''}</p>` : ''}
            </div>`).join('')}
          </div>`;
        }).join('')}
    </div>
  </div>

  <footer>
    <p>Generated with <a href="https://github.com/mmmprod/task-plugin">Claude Code Task Plugin</a></p>
    <p>Last updated: ${new Date().toISOString().split('T')[0]}</p>
  </footer>
</body>
</html>`;

  return html;
}

/**
 * Escape HTML entities
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  const format = args[0] || 'portfolio';

  try {
    const projectDir = utils.getProjectDir();
    const tasks = getAllTasks(projectDir);

    let output;
    let filename;

    switch (format) {
      case 'json':
        output = exportToJson(tasks);
        filename = 'tasks-export.json';
        break;

      case 'task':
        if (!args[1]) {
          console.error('Usage: export.js task <task_id>');
          process.exit(1);
        }
        output = exportTaskToJson(projectDir, args[1]);
        filename = `${args[1]}.json`;
        break;

      case 'portfolio':
      default:
        const projectName = args[1] || path.basename(projectDir);
        output = generatePortfolio(tasks, projectName);
        filename = 'portfolio.html';
        break;
    }

    // Write to file
    const outputPath = path.join(projectDir, filename);
    fs.writeFileSync(outputPath, output);
    console.log(`\n✅ Exported to: ${outputPath}`);

    if (format === 'portfolio') {
      console.log('\n📋 To deploy to GitHub Pages:');
      console.log('   1. Rename to index.html');
      console.log('   2. Push to gh-pages branch');
      console.log('   3. Enable GitHub Pages in repo settings');
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

module.exports = {
  getAllTasks,
  exportToJson,
  generatePortfolio
};
