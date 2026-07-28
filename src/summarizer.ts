import OpenAI from 'openai'
import type { CollectedItem } from './types.js'
import type { Config } from './config.js'

export function buildPrompt(items: CollectedItem[], period: string): string {
  const sections = items.map(i =>
    `[${i.source}/${i.type}] ${i.title} (${i.status ?? 'no status'})${i.description ? '\n  ' + i.description.slice(0, 300) : ''}`
  ).join('\n')

  return `You are a professional review assistant. Summarize the following activity for a ${period} professional review.

Focus on:
- What was accomplished
- Decisions made
- Action items / follow-ups
- Notable patterns or trends

Keep it concise (2-4 paragraphs). Do not use bullet points.

Activity:
${sections}`
}

export async function generateSummary(items: CollectedItem[], config: Config, period: string): Promise<string> {
  if (items.length === 0) return 'No activity to summarize.'

  const openai = new OpenAI({ apiKey: config.ai.apiKey })
  const prompt = buildPrompt(items, period)

  const response = await openai.chat.completions.create({
    model: config.ai.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    max_tokens: 500
  })

  return response.choices[0]?.message?.content ?? 'Summary generation failed.'
}
