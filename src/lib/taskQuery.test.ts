import { describe, expect, it } from 'vitest'
import type { Task } from './db'
import { filterAndSortTasks, parseLabelsInput, taskMatchesQuery, type TaskQuery } from './taskQuery'

const tasks: Task[] = [
  {
    id: 1,
    title: 'Fix login bug',
    tags: ['bug', 'urgent'],
    status: 'todo',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 2,
    title: 'Design dashboard',
    tags: ['feature'],
    status: 'in_progress',
    createdAt: '2026-03-01T11:00:00.000Z',
    updatedAt: '2026-03-01T12:00:00.000Z',
  },
]

const baseQuery: TaskQuery = {
  searchText: '',
  statuses: [],
  labels: [],
  sortBy: 'updatedAt',
  sortDirection: 'desc',
}

describe('parseLabelsInput', () => {
  it('normalizes and deduplicates labels', () => {
    expect(parseLabelsInput('Bug, urgent, bug , FEATURE')).toEqual(['bug', 'urgent', 'feature'])
  })
})

describe('task query engine', () => {
  it('matches across encrypted-description plaintext context', () => {
    const matches = taskMatchesQuery(
      tasks[1],
      { ...baseQuery, searchText: 'stakeholder' },
      { descriptionByTaskId: { 2: 'Review with stakeholder before demo' } },
    )

    expect(matches).toBe(true)
  })

  it('filters by status + labels and sorts by title asc', () => {
    const result = filterAndSortTasks(tasks, {
      ...baseQuery,
      statuses: ['todo', 'in_progress'],
      labels: ['bug'],
      sortBy: 'title',
      sortDirection: 'asc',
    })

    expect(result.map((task) => task.id)).toEqual([1])
  })
})
