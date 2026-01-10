<img width="1024" height="559" alt="image" src="https://github.com/user-attachments/assets/4a962993-0ee4-4281-90a8-3eeb2a515672" />
 
 # Task Plugin

Complex Task Mode for Claude Code — Persistence + Recovery for long tasks.

## Problem Solved

- Claude drifts from original goal
- Context lost after crash/compact
- No way to track progress on complex tasks

## Features

- `/task-start` — Create a task with plan, checklist, handoff, decisions log
- `/task-status` — Show progress and recent decisions
- `/task-done` — Complete and archive task
- **PreCompact hook** — Auto-generates handoff before compact

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
/task-done
```

## Files Created
```
.claude/task/<task_id>/
├── plan.md        # Task plan and approach
├── checklist.md   # Progress tracking
├── handoff.md     # Auto-updated before compact
└── decisions.log  # Append-only audit trail
```

## Author


[mmmprod](https://github.com/mmmprod)
