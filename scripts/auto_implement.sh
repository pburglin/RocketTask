#!/bin/bash
# Autonomous Implementation Script for Task Reporter App

PROJECT_DIR="/Users/bob1/Documents/projects/task-reporter-app"
cd "$PROJECT_DIR" || exit

# 1. Identify current task
CURRENT_TASK_ID=$(grep "Active Task:" STATE.md | cut -d':' -f2 | xargs)
echo "Running autonomous implementation for: $CURRENT_TASK_ID"

# 2. Spawn implementation sub-agent (ACP coding session)
# Using 'coder' alias/identity from AGENTS.md
openclaw sessions spawn \
  --runtime acp \
  --task "Implement task $CURRENT_TASK_ID in $PROJECT_DIR. Follow PRD and ARCHITECTURE.md strictly. Run 'npm run build' to verify. Once done, update TASKS.md (check off the item) and update STATE.md with the next task." \
  --cwd "$PROJECT_DIR" \
  --label "coder-$CURRENT_TASK_ID"

echo "Implementation session spawned."
