<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/4a962993-0ee4-4281-90a8-3eeb2a515672" />

[![GitHub release](https://img.shields.io/github/v/release/mmmprod/task-plugin)](https://github.com/mmmprod/task-plugin/releases)
[![GitHub stars](https://img.shields.io/github/stars/mmmprod/task-plugin)](https://github.com/mmmprod/task-plugin/stargazers)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://claude.ai/claude-code)

# Task Plugin v2.0

Complex Task Mode for Claude Code — Full-featured task management with templates, analytics, achievements, and collaboration.

## Problem Solved

- Claude drifts from original goal
- Context lost after crash/compact
- No way to track progress on complex tasks
- No gamification or productivity insights

## Core Features

| Command | Description |
|---------|-------------|
| `/task-start` | Create a task with plan, checklist, handoff, decisions log |
| `/task-status` | Show progress and recent decisions |
| `/task-switch` | Switch between multiple tasks or restore archived tasks |
| `/task-done` | Complete and archive task |

## New in v2.0

### Task Templates
Start tasks from predefined templates with ready-made checklists.

```
/task-template bugfix "Fix login timeout"
/task-template feature "Add dark mode"
/task-template refactor "Clean up auth module"
```

Templates: `bugfix`, `feature`, `refactor`, `hotfix`, `research`

### Analytics Dashboard
Track your productivity with detailed statistics.

```
/task-stats
```

Shows: completed tasks, avg duration, productive hours, task types distribution.

### Achievements & Streaks
Gamification to keep you motivated.

```
/task-achievements
```

Badges: Streak, Speed Demon, Centurion, Night Owl, Early Bird, Bug Hunter, Architect, Perfectionist.

### Snapshots
Create checkpoints before risky changes.

```
/task-snapshot "Before refactor"
/task-restore snap_2026-01-10T15-00-00
```

### Testing Checklists
Add testing checklists by task type.

```
/task-test-mode feature
/task-test-mode bugfix
```

Templates: `feature`, `bugfix`, `refactor`, `api`, `ui`, `security`, `deployment`, `quick`

### Dependencies & Subtasks
Break down complex tasks into manageable pieces.

```
/task-subtask "Implement OAuth backend"
/task-tree
```

### AI Recommender
Get smart suggestions for what to do next.

```
/task-recommend
```

Based on: task patterns, missing practices, recent trends.

### Export & Portfolio
Generate a professional portfolio from your completed tasks.

```
/task-export              # HTML portfolio
/task-export json         # JSON export
```

### Collaboration
Share tasks with teammates.

```
/task-share               # Export task for sharing
/task-import file.json    # Import shared task
/task-comment "Need help" # Add comments
```

### Voice Dictation
Add voice notes to decisions log.

```
/task-voice-note
```

Supports Whisper local for offline transcription.

## Install

Copy the `.claude/` folder to your project:
```bash
git clone https://github.com/mmmprod/task-plugin.git
cp -r task-plugin/.claude your-project/
```

## Quick Start
```bash
/task-template feature "Add user authentication"
# ... work on the task ...
/task-snapshot "Checkpoint"
/task-test-mode feature
/task-achievements
/task-done
/task-export
```

## Files Structure
```
.claude/task/<task_id>/
├── plan.md           # Task plan and approach
├── checklist.md      # Progress tracking
├── handoff.md        # Auto-updated before compact
├── decisions.log     # Append-only audit trail
├── dependencies.json # Parent/child relationships
├── comments.json     # Collaboration comments
└── snapshots/        # Task checkpoints

.claude/task/archive/     # Completed tasks
.claude/task/stats.json   # Analytics cache
.claude/task/achievements.json
```

## All Commands

| Command | Description |
|---------|-------------|
| `/task-start` | Start a new task |
| `/task-template` | Start from template |
| `/task-status` | Show current progress |
| `/task-switch` | Switch between tasks |
| `/task-done` | Complete and archive |
| `/task-achievements` | View badges and streaks |
| `/task-stats` | Analytics dashboard |
| `/task-snapshot` | Create checkpoint |
| `/task-restore` | Restore checkpoint |
| `/task-test-mode` | Add testing checklist |
| `/task-subtask` | Create subtask |
| `/task-tree` | View task hierarchy |
| `/task-recommend` | Get AI suggestions |
| `/task-export` | Export/portfolio |
| `/task-share` | Share task |
| `/task-import` | Import shared task |
| `/task-comment` | Add comment |
| `/task-voice-note` | Voice dictation |

## Author

[mmmprod](https://github.com/mmmprod)
