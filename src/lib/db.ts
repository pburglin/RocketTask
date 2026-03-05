import Dexie, { type EntityTable } from 'dexie'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Task {
  id?: number
  title: string
  descriptionCiphertext?: string
  tags: string[]
  status: TaskStatus
  deadline?: string
  nextCheckpoint?: string
  stakeholders?: string[]
  nextAction?: string
  loe?: number
  priority?: number
  createdAt: string
  updatedAt: string
}

export interface TimeLog {
  id?: number
  taskId: number
  startedAt: string
  endedAt?: string
  durationSeconds?: number
}

export interface Setting {
  key: string
  value: string
}

class TaskReporterDatabase extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  timeLogs!: EntityTable<TimeLog, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor() {
    super('taskReporterDb')

    this.version(1).stores({
      tasks: '++id, status, updatedAt, createdAt',
      timeLogs: '++id, taskId, startedAt, endedAt',
      settings: '&key',
    })

    this.version(2).stores({
      tasks: '++id, status, updatedAt, createdAt, deadline, nextCheckpoint',
      timeLogs: '++id, taskId, startedAt, endedAt',
      settings: '&key',
    })

    this.version(3).stores({
      tasks: '++id, status, updatedAt, createdAt, deadline, nextCheckpoint, loe, priority',
      timeLogs: '++id, taskId, startedAt, endedAt',
      settings: '&key',
    })
  }

  async ensureTaskDefaults(): Promise<void> {
    await this.tasks.toCollection().modify((task) => {
      if (!Array.isArray(task.stakeholders)) task.stakeholders = []
      if (!Array.isArray(task.tags)) task.tags = []
    })
  }
}

export const db = new TaskReporterDatabase()
