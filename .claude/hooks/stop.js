const fs = require('fs');
const path = require('path');

// Read stdin (hook input)
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const taskDir = path.join(projectDir, '.claude', 'task');
    
    if (!fs.existsSync(taskDir)) {
      process.exit(0);
    }
    
    const tasks = fs.readdirSync(taskDir).filter(f => 
      fs.statSync(path.join(taskDir, f)).isDirectory()
    );
    
    if (tasks.length === 0) {
      process.exit(0);
    }
    
    const activeTask = tasks.sort().reverse()[0];
    const logPath = path.join(taskDir, activeTask, 'decisions.log');
    
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] Response completed\n`;
    
    fs.appendFileSync(logPath, entry);
    
  } catch (e) {
    // Silent fail
  }
  process.exit(0);
});