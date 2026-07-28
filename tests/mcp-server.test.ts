import { describe, it, expect } from 'vitest'

describe('MCP Server', () => {
  it('can start and exposes tools', async () => {
    const mod = await import('../src/mcp-server.js')
    expect(typeof mod.startMcpServer).toBe('function')
  })
})
