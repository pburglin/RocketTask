import type { Task, TimeLog } from './db'

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function tasksToCsv(tasks: Task[], descriptionByTaskId: Record<number, string> = {}): string {
  const header = [
    'id',
    'title',
    'description',
    'labels',
    'status',
    'deadline',
    'nextCheckpoint',
    'stakeholders',
    'nextAction',
    'loe',
    'priority',
    'createdAt',
    'updatedAt',
  ]
  const rows = tasks.map((task) => {
    const description = task.id ? descriptionByTaskId[task.id] ?? '' : ''
    return [
      String(task.id ?? ''),
      task.title,
      description,
      task.tags.join('|'),
      task.status,
      task.deadline ?? '',
      task.nextCheckpoint ?? '',
      (task.stakeholders ?? []).join('|'),
      task.nextAction ?? '',
      String(task.loe ?? ''),
      String(task.priority ?? ''),
      task.createdAt,
      task.updatedAt,
    ]
      .map(escapeCsv)
      .join(',')
  })

  return [header.join(','), ...rows].join('\n')
}

export interface WeeklyReport {
  weekLabel: string
  generatedAt: string
  taskCount: number
  doneCount: number
  inProgressCount: number
  todoCount: number
  totalTrackedSeconds: number
  lines: string[]
  text: string
}

function startOfWeek(date: Date): Date {
  const value = new Date(date)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setDate(value.getDate() + diff)
  value.setHours(0, 0, 0, 0)
  return value
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

export function generateWeeklyReport(
  tasks: Task[],
  timeLogs: TimeLog[],
  descriptionByTaskId: Record<number, string> = {},
  now = new Date(),
): WeeklyReport {
  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  weekEnd.setHours(23, 59, 59, 999)

  const includedTaskIds = new Set(tasks.map((task) => task.id).filter((id): id is number => typeof id === 'number'))

  const weeklyLogs = timeLogs
    .filter((log) => includedTaskIds.has(log.taskId))
    .filter((log) => {
      const started = new Date(log.startedAt)
      return started >= weekStart && started <= weekEnd
    })

  const totalTrackedSeconds = weeklyLogs.reduce((sum, log) => sum + (log.durationSeconds ?? 0), 0)

  const timeByTaskId = weeklyLogs.reduce<Record<number, number>>((acc, log) => {
    acc[log.taskId] = (acc[log.taskId] ?? 0) + (log.durationSeconds ?? 0)
    return acc
  }, {})

  const doneCount = tasks.filter((task) => task.status === 'done').length
  const inProgressCount = tasks.filter((task) => task.status === 'in_progress').length
  const todoCount = tasks.filter((task) => task.status === 'todo').length

  const lines = tasks.map((task) => {
    const description = task.id ? descriptionByTaskId[task.id] ?? '' : ''
    const labels = task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : ''
    const scheduling = [
      task.deadline ? `deadline ${new Date(task.deadline).toLocaleDateString()}` : '',
      task.nextCheckpoint ? `checkpoint ${new Date(task.nextCheckpoint).toLocaleDateString()}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const scheduleSnippet = scheduling ? ` (${scheduling})` : ''
    const scoring = [
      task.priority ? `priority ${task.priority}` : '',
      task.loe ? `loe ${task.loe}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    const scoringSnippet = scoring ? ` [${scoring}]` : ''
    const descriptionSnippet = description ? ` — ${description}` : ''
    return `- ${task.title} (${task.status})${labels}${scheduleSnippet}${scoringSnippet}${descriptionSnippet}`
  })

  const timeBreakdownLines = tasks
    .map((task) => ({
      title: task.title,
      seconds: task.id ? timeByTaskId[task.id] ?? 0 : 0,
    }))
    .filter((item) => item.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .map((item) => {
      const pct = totalTrackedSeconds > 0 ? Math.round((item.seconds / totalTrackedSeconds) * 100) : 0
      return `- ${item.title}: ${formatDuration(item.seconds)} (${pct}%)`
    })

  const topTaskLine = timeBreakdownLines[0] ?? '- No tracked time yet this week.'

  const weekLabel = `${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`
  const generatedAt = now.toISOString()
  const summary = [
    `Weekly Task Report (${weekLabel})`,
    `Generated: ${new Date(generatedAt).toLocaleString()}`,
    '',
    `Visible tasks: ${tasks.length}`,
    `Done: ${doneCount} | In progress: ${inProgressCount} | Todo: ${todoCount}`,
    `Tracked time this week: ${formatDuration(totalTrackedSeconds)}`,
    `Top time focus: ${topTaskLine.replace(/^- /, '')}`,
    '',
    'Time breakdown by task:',
    ...(timeBreakdownLines.length > 0 ? timeBreakdownLines : ['- No tracked time yet.']),
    '',
    'Tasks:',
    ...(lines.length > 0 ? lines : ['- No tasks match the current filters.']),
  ]

  return {
    weekLabel,
    generatedAt,
    taskCount: tasks.length,
    doneCount,
    inProgressCount,
    todoCount,
    totalTrackedSeconds,
    lines,
    text: summary.join('\n'),
  }
}
