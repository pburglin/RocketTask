export interface AiRewriteOptions {
  apiKey?: string
  model?: string
  endpoint?: string
  context?: string
}

export async function rewriteTaskText(input: string, options: AiRewriteOptions = {}): Promise<string> {
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (!options.apiKey) {
    return heuristicRewrite(trimmed)
  }

  const endpoint = options.endpoint || 'https://openrouter.ai/api/v1/chat/completions'
  const model = options.model || 'openai/gpt-4o-mini'

  const prompt = `Rewrite this work task to be clear, concise, and measurable. Keep original intent.\n\nTask:\n${trimmed}\n\nReturn only rewritten text.`
  const context = options.context ? `Context:\n${options.context}\n\n` : ''

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You improve task descriptions for weekly engineering reporting.' },
        { role: 'user', content: `${context}${prompt}` },
      ],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    throw new Error(`AI rewrite failed (${response.status})`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const output = data.choices?.[0]?.message?.content?.trim()
  return output || heuristicRewrite(trimmed)
}

function heuristicRewrite(input: string): string {
  const cleaned = input.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 20) return cleaned

  return `${cleaned}. Success criteria: clear deliverable, owner-aligned update, and measurable completion.`
}
