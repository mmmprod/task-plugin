# Complete task

## Instructions

1. Find the active task in `.claude/CLAUDE.md` or `.claude/task/`

2. If no active task, tell the user there is nothing to complete

3. If active task found:
   - Update checklist.md: mark all items done, set Status to COMPLETED
   - Update handoff.md: set Current State to "Task completed"
   - Append to decisions.log: "[TIMESTAMP] Task marked as complete"
   - Remove the task imports from `.claude/CLAUDE.md`

4. Tell the user:
   - Task completed
   - Summary of what was accomplished
   - Files remain in `.claude/task/<id>/` for reference