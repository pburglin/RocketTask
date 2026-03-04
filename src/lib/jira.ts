export interface JiraImportItem {
  title: string
  labels: string[]
  description?: string
}

function cleanLabel(value: string): string {
  return value.trim().toLowerCase()
}

export function parseJiraText(input: string): JiraImportItem[] {
  const text = input.trim()
  if (!text) return []

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const maybeCsvHeader = lines[0].toLowerCase()
  if (maybeCsvHeader.includes('summary') && maybeCsvHeader.includes(',')) {
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const summaryIndex = header.findIndex((h) => h === 'summary' || h === 'title')
    const labelsIndex = header.findIndex((h) => h.includes('label') || h.includes('tag'))
    const descriptionIndex = header.findIndex((h) => h.includes('description'))

    if (summaryIndex >= 0) {
      return lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim())
        return {
          title: cols[summaryIndex] || 'Imported Jira task',
          labels: labelsIndex >= 0 ? cols[labelsIndex].split(/[|;]/).map(cleanLabel).filter(Boolean) : [],
          description: descriptionIndex >= 0 ? cols[descriptionIndex] : undefined,
        }
      })
    }
  }

  // Fallback plain text parser:
  // - ABC-123: title text
  // - [bug][backend] title text
  return lines.map((line) => {
    const keyMatch = line.match(/^([A-Z][A-Z0-9]+-\d+)\s*[:-]?\s*(.*)$/)
    if (keyMatch) {
      return {
        title: `${keyMatch[1]} ${keyMatch[2]}`.trim(),
        labels: ['jira'],
      }
    }

    const bracketLabels = Array.from(line.matchAll(/\[([^\]]+)\]/g)).map((m) => cleanLabel(m[1]))
    const title = line.replace(/\[[^\]]+\]/g, '').trim()

    return {
      title: title || 'Imported Jira task',
      labels: bracketLabels,
    }
  })
}
