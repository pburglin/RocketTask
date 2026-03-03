#!/bin/bash
# Autonomous Implementation Script for Task Reporter App

PROJECT_DIR="/Users/bob1/Documents/projects/task-reporter-app"
cd "$PROJECT_DIR" || exit

# 1. Identify current task
# Ensure we get the ID correctly even if there's extra whitespace or formatting
CURRENT_TASK_ID=$(grep "Active Task:" STATE.md | cut -d':' -f2 | xargs | sed 's/\*\*//g')

if [ -z "$CURRENT_TASK_ID" ]; then
    echo "No active task found in STATE.md. Development complete?"
    exit 0
fi

echo "Running autonomous implementation for: $CURRENT_TASK_ID"

# 2. Spawn implementation sub-agent (ACP coding session)
# OpenClaw sessions_spawn uses JSON params when called via tool. 
# Since I'm in a shell script, I'll use the OpenClaw CLI equivalent.
# Note: 'openclaw spawn' is the CLI command for sessions_spawn.
openclaw spawn \
  --mode run \
  --runtime acp \
  --task "Implement task $CURRENT_TASK_ID in $PROJECT_DIR. Follow docs/PRD.md and docs/ARCHITECTURE.md strictly. Run 'npm run build' to verify. Once done: 1. Update TASKS.md (check off the item). 2. Update STATE.md with the next task ID from TASKS.md. 3. Commit changes with a clear message." \
  --cwd "$PROJECT_DIR" \
  --label "coder-$CURRENT_TASK_ID"

echo "Implementation session spawned."
