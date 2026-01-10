# Task Plan

## Goal
Fix CMD window flashing on Windows when hooks execute during /task-start and other operations.

## Approach
1. Modify hooks to use PowerShell with `-WindowStyle Hidden` instead of direct `node` calls
2. This will run the commands invisibly without any window flash

## Success Criteria
- Hooks execute without any visible CMD window
- All functionality remains the same
