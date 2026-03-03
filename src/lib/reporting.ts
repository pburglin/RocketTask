import type { Task } from './db'

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`
  }
  return value
}

export function tasksToCsv(tasks: Task[], descriptionByTaskId: Record<number, string> = {}): string {
  const header = ['id', 'title', 'description', 'labels', 'status', 'createdAt', 'updatedAt']
  const rows = tasks.map((task) => {
    const description = task.id ? descriptionByTaskId[task.id] ?? '' : ''
    return [
      String(task.id ?? ''),
      task.title,
      description,
      task.tags.join('|'),
      task.status,
      task.createdAt,
      task.updatedAt,
    ]
      .map(escapeCsv)
      .join(',')
  })

  return [header.join(','), ...rows].join('\n')
}
