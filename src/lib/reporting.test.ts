import { describe, expect, it } from 'vitest'
import type { Task } from './db'
import { tasksToCsv } from './reporting'

describe('tasksToCsv', () => {
  it('includes labels and resolved descriptions in csv rows', () => {
    const tasks: Task[] = [
      {
        id: 5,
        title: 'Write report',
        tags: ['report', 'weekly'],
        status: 'done',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ]

    const csv = tasksToCsv(tasks, { 5: 'Ready for export' })

    expect(csv).toContain('id,title,description,labels,status,createdAt,updatedAt')
    expect(csv).toContain('5,Write report,Ready for export,report|weekly,done')
  })
})
