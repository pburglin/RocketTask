import { describe, expect, it } from 'vitest'
import type { Task, TimeLog } from './db'
import { generateWeeklyReport, tasksToCsv } from './reporting'

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

describe('generateWeeklyReport', () => {
  it('builds summary counts and tracked time from visible tasks + week logs', () => {
    const tasks: Task[] = [
      {
        id: 1,
        title: 'Build dashboard',
        tags: ['feature'],
        status: 'in_progress',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
      {
        id: 2,
        title: 'Fix timer bug',
        tags: ['bug', 'urgent'],
        status: 'done',
        createdAt: '2026-03-01T00:00:00.000Z',
        updatedAt: '2026-03-02T00:00:00.000Z',
      },
    ]

    const logs: TimeLog[] = [
      {
        id: 10,
        taskId: 1,
        startedAt: '2026-03-02T12:00:00.000Z',
        endedAt: '2026-03-02T12:30:00.000Z',
        durationSeconds: 1800,
      },
      {
        id: 11,
        taskId: 2,
        startedAt: '2026-02-22T12:00:00.000Z',
        endedAt: '2026-02-22T12:30:00.000Z',
        durationSeconds: 1800,
      },
    ]

    const report = generateWeeklyReport(tasks, logs, { 2: 'Patched and verified' }, new Date('2026-03-03T15:00:00.000Z'))

    expect(report.taskCount).toBe(2)
    expect(report.doneCount).toBe(1)
    expect(report.inProgressCount).toBe(1)
    expect(report.totalTrackedSeconds).toBe(1800)
    expect(report.text).toContain('Tracked time this week: 0h 30m')
    expect(report.text).toContain('- Fix timer bug (done) [bug, urgent] — Patched and verified')
  })
})
