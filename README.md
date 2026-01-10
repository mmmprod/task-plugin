<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/4a962993-0ee4-4281-90a8-3eeb2a515672" />

[![GitHub release](https://img.shields.io/github/v/release/mmmprod/task-plugin)](https://github.com/mmmprod/task-plugin/releases)
[![GitHub stars](https://img.shields.io/github/stars/mmmprod/task-plugin)](https://github.com/mmmprod/task-plugin/stargazers)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://claude.ai/claude-code)

# Task Plugin

Complex Task Mode for Claude Code — Persistence + Recovery for long tasks.

## Problem Solved

- Claude drifts from original goal
- Context lost after crash/compact
- No way to track progress on complex tasks

## Features

- `/task-start` — Create a task with plan, checklist, handoff, decisions log
- `/task-status` — Show progress and recent decisions
- `/task-switch` — Switch between multiple tasks or restore archived tasks
- `/task-done` — Complete and archive task
- **PreCompact hook** — Auto-generates handoff before compact
- **Auto-archive** — Completed tasks move to archive folder
- **Log rotation** — Decisions log auto-trims at 500 entries
- **File locking** — Prevents race conditions on concurrent writes

## ⚠️ Windows Users

Hooks may cause console windows to flash briefly. This is a Claude CLI limitation — no workaround exists for fully hidden hook execution. The plugin works correctly despite the visual noise.

## Install

Copy the `.claude/` folder to your project:
```bash
git clone https://github.com/mmmprod/task-plugin.git
cp -r task-plugin/.claude your-project/
```

Or manually copy:
- `.claude/commands/` — task commands
- `.claude/hooks/` — precompact script
- `.claude/settings.local.json` — hook config

## Usage
```
/task-start "Migrate auth from JWT to OAuth2"
/task-status
/task-switch              # List and switch between tasks
/task-done                # Complete and archive
```

## Files Created
```
.claude/task/<task_id>/
├── plan.md           # Task plan and approach
├── checklist.md      # Progress tracking
├── handoff.md        # Auto-updated before compact
└── decisions.log     # Append-only audit trail (auto-rotated)

.claude/task/archive/     # Completed tasks stored here
.claude/task/error.log    # Hook errors logged here
```

## Author

[mmmprod](https://github.com/mmmprod)
