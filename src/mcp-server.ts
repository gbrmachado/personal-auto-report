import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { generateReview } from './review.js'

type ReviewGenerator = (period: string, useAi: boolean) => Promise<string>

export async function executeReviewTool(
  name: string,
  args: Record<string, unknown> | undefined,
  reviewGenerator: ReviewGenerator = generateReview
) {
  try {
    const ai = typeof args?.ai === 'boolean' ? args.ai : false
    const period = name === 'daily_review'
      ? 'daily'
      : name === 'weekly_review'
        ? 'weekly'
        : name === 'monthly_review'
          ? 'monthly'
          : null

    if (!period) throw new Error(`Unknown tool: ${name}`)

    const markdown = await reviewGenerator(period, ai)
    return { content: [{ type: 'text' as const, text: markdown }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true
    }
  }
}

export async function startMcpServer(): Promise<void> {
  const server = new Server(
    {
      name: 'ai-professional-review',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'daily_review',
        description: 'Generate a daily professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      },
      {
        name: 'weekly_review',
        description: 'Generate a weekly professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      },
      {
        name: 'monthly_review',
        description: 'Generate a monthly professional review',
        inputSchema: {
          type: 'object',
          properties: {
            ai: { type: 'boolean', description: 'Include AI summary' }
          }
        }
      }
    ]
  }))

  server.setRequestHandler(CallToolRequestSchema, request =>
    executeReviewTool(request.params.name, request.params.arguments)
  )

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
