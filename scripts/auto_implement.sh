#!/bin/bash
# Autonomous Implementation Script for Task Reporter App

PROJECT_DIR="/Users/bob1/Documents/projects/task-reporter-app"
cd "$PROJECT_DIR" || exit

# 1. Identify current task
CURRENT_TASK_ID=$(grep "Active Task:" STATE.md | cut -d':' -f2 | xargs | sed 's/\*\*//g')

if [ -z "$CURRENT_TASK_ID" ]; then
    echo "No active task found in STATE.md. Development complete?"
    exit 0
fi

echo "Running autonomous implementation for: $CURRENT_TASK_ID"

# 2. Trigger implementation via OpenClaw 'cron run' or 'agent'
# Since we want to spawn an ACP session, the best way from a script without a direct 'spawn' CLI
# is to send a message to the main agent (me) to trigger it, or use the 'cron add' mechanism
# for a one-shot immediate job that targets an isolated session.

# However, since I am ALREADY the agent, I can just call the sessions_spawn tool directly
# if I were running this logic inside my turn. Since this is a CRON script, 
# it's better to use the OpenClaw 'agent' CLI to send a command to the gateway.

openclaw agent \
  --message "Implement task $CURRENT_TASK_ID in $PROJECT_DIR using an ACP session. Follow docs/PRD.md and docs/ARCHITECTURE.md. Update TASKS.md and STATE.md when done." \
  --deliver

echo "Task implementation request sent to OpenClaw gateway."
