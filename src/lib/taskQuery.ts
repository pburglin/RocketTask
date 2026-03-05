import type { Task } from './db'

export type TaskSortField =
  | 'updatedAt'
  | 'createdAt'
  | 'title'
  | 'status'
  | 'deadline'
  | 'nextCheckpoint'
  | 'nextAction'
  | 'loe'
  | 'priority'
export type SortDirection = 'asc' | 'desc'

export interface TaskQuery {
  searchText: string
  statuses: Task['status'][]
  labels: string[]
  sortBy: TaskSortField
  sortDirection: SortDirection
}

export interface TaskFilterContext {
  descriptionByTaskId?: Record<number, string>
}

export const defaultTaskQuery: TaskQuery = {
  searchText: '',
  statuses: [],
  labels: [],
  sortBy: 'updatedAt',
  sortDirection: 'desc',
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

export function parseLabelsInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((part) => normalizeLabel(part))
        .filter(Boolean),
    ),
  )
}

export function parseStakeholdersInput(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  )
}

export function getTaskSearchBlob(task: Task, context?: TaskFilterContext): string {
  const description = task.id ? context?.descriptionByTaskId?.[task.id] ?? '' : ''
  return [
    task.title,
    description,
    task.status,
    task.tags.join(' '),
    (task.stakeholders ?? []).join(' '),
    task.nextAction ?? '',
    task.deadline ?? '',
    task.nextCheckpoint ?? '',
    String(task.loe ?? ''),
    String(task.priority ?? ''),
    task.createdAt,
    task.updatedAt,
  ]
    .join(' ')
    .toLowerCase()
}

export function taskMatchesQuery(task: Task, query: TaskQuery, context?: TaskFilterContext): boolean {
  if (query.statuses.length > 0 && !query.statuses.includes(task.status)) {
    return false
  }

  if (query.labels.length > 0) {
    const taskLabels = task.tags.map(normalizeLabel)
    const missingLabel = query.labels.some((label) => !taskLabels.includes(normalizeLabel(label)))
    if (missingLabel) return false
  }

  const text = query.searchText.trim().toLowerCase()
  if (!text) return true

  return getTaskSearchBlob(task, context).includes(text)
}

function compareString(a: string, b: string): number {
  return a.localeCompare(b)
}

function compareDateMaybe(a?: string, b?: string): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return new Date(a).getTime() - new Date(b).getTime()
}

function compareTaskValues(a: Task, b: Task, field: TaskSortField): number {
  switch (field) {
    case 'title':
    case 'status':
      return compareString(a[field], b[field])
    case 'deadline':
      return compareDateMaybe(a.deadline, b.deadline)
    case 'nextCheckpoint':
      return compareDateMaybe(a.nextCheckpoint, b.nextCheckpoint)
    case 'nextAction':
      return compareString(a.nextAction ?? '', b.nextAction ?? '')
    case 'loe':
      return (a.loe ?? Number.POSITIVE_INFINITY) - (b.loe ?? Number.POSITIVE_INFINITY)
    case 'priority':
      return (a.priority ?? Number.POSITIVE_INFINITY) - (b.priority ?? Number.POSITIVE_INFINITY)
    case 'createdAt':
    case 'updatedAt':
    default:
      return new Date(a[field]).getTime() - new Date(b[field]).getTime()
  }
}

export function filterAndSortTasks(tasks: Task[], query: TaskQuery, context?: TaskFilterContext): Task[] {
  const filtered = tasks.filter((task) => taskMatchesQuery(task, query, context))

  const directionFactor = query.sortDirection === 'asc' ? 1 : -1

  return filtered.sort((a, b) => {
    const value = compareTaskValues(a, b, query.sortBy)
    if (value !== 0) return value * directionFactor

    const aId = a.id ?? 0
    const bId = b.id ?? 0
    return (aId - bId) * directionFactor
  })
}
