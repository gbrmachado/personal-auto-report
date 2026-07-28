import { describe, it, expect, vi } from 'vitest'

describe('MCP Server', () => {
  it('can start and exposes tools', async () => {
    const mod = await import('../src/mcp-server.js')
    expect(typeof mod.startMcpServer).toBe('function')
  })

  it('returns a structured error when review generation fails', async () => {
    const { executeReviewTool } = await import('../src/mcp-server.js')
    const generate = vi.fn().mockRejectedValue('service unavailable')

    const result = await executeReviewTool('daily_review', { ai: true }, generate)

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Error: service unavailable' }],
      isError: true
    })
  })
})
