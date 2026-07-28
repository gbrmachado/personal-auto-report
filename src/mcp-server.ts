import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { generateReview } from './review.js'

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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const ai = typeof request.params.arguments?.ai === 'boolean' ? request.params.arguments.ai : false
      let markdown: string

      switch (request.params.name) {
        case 'daily_review':
          markdown = await generateReview('daily', ai)
          break
        case 'weekly_review':
          markdown = await generateReview('weekly', ai)
          break
        case 'monthly_review':
          markdown = await generateReview('monthly', ai)
          break
        default:
          throw new Error(`Unknown tool: ${request.params.name}`)
      }

      return {
        content: [{ type: 'text', text: markdown }]
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      }
    }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
