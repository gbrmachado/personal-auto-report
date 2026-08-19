import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderFocusJson, renderFocusMarkdown } from '../src/focus/renderers.js'
import type { FocusReport } from '../src/focus/types.js'
import { FileOutput } from '../src/outputs/file.js'
import { StdoutOutput } from '../src/outputs/stdout.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

function report(): FocusReport {
  const primary = {
    source: 'linear' as const,
    id: 'ENG-1',
    title: 'Finish checkout recovery',
    url: 'https://linear.app/ENG-1',
    status: 'In Review',
    priority: 1,
    reasonCodes: ['URGENT_PRIORITY', 'NEAR_CLOSURE'] as const,
    explanation: 'Urgent and near closure',
    nextAction: 'Answer review feedback',
    closureRoute: 'merge → deploy → Done',
    lastEvidenceAt: '2026-08-19T12:00:00.000Z',
    ageDays: 1
  }
  return {
    id: 'focus-2026-08-20', date: '2026-08-20', revision: 1,
    generatedAt: '2026-08-20T12:00:00.000Z', timezone: 'UTC',
    primaryFocus: [primary], closeToday: [primary], reviews: [],
    followUps: [], blocked: [], avoidStarting: [], warnings: []
  }
}

describe('focus renderers', () => {
  it('renders an actionable Markdown briefing', () => {
    const markdown = renderFocusMarkdown(report())

    expect(markdown).toContain('# Engineering Focus — 2026-08-20')
    expect(markdown).toContain('[Finish checkout recovery](https://linear.app/ENG-1)')
    expect(markdown).toContain('Next action: Answer review feedback')
    expect(markdown).toContain('Closure route: merge → deploy → Done')
  })

  it('renders the canonical report as JSON', () => {
    expect(JSON.parse(renderFocusJson(report()))).toEqual(report())
  })

  it('escapes external Markdown titles and rejects unsafe link schemes', () => {
    const unsafe = report()
    unsafe.primaryFocus[0] = {
      ...unsafe.primaryFocus[0],
      title: '[click](javascript:alert(1))',
      url: 'javascript:alert(1)'
    }

    const markdown = renderFocusMarkdown(unsafe)

    expect(markdown).not.toContain('](javascript:')
    expect(markdown).toContain('\\[click\\]\\(javascript:alert\\(1\\)\\)')
  })

  it('escapes GFM strikethrough syntax in external Markdown fields', () => {
    const unsafe = report()
    unsafe.primaryFocus[0] = {
      ...unsafe.primaryFocus[0],
      title: '~~spoofed~~'
    }

    const markdown = renderFocusMarkdown(unsafe)

    expect(markdown).toContain('[\\~\\~spoofed\\~\\~](https://linear.app/ENG-1)')
    expect(markdown).not.toContain('[~~spoofed~~]')
  })

  it('neutralizes raw HTML from external fields and warnings', () => {
    const unsafe = report()
    unsafe.primaryFocus[0] = {
      ...unsafe.primaryFocus[0],
      title: '<img src=x onerror=alert(1)>'
    }
    unsafe.warnings = ['<script>alert(1)</script>']

    const markdown = renderFocusMarkdown(unsafe)

    expect(markdown).not.toContain('<img')
    expect(markdown).not.toContain('<script>')
    expect(markdown).toContain('&lt;img src=x onerror=alert\\(1\\)&gt;')
    expect(markdown).toContain('&lt;script&gt;alert\\(1\\)&lt;/script&gt;')
  })

  it('removes terminal control characters from external Markdown fields', () => {
    const unsafe = report()
    unsafe.primaryFocus[0] = {
      ...unsafe.primaryFocus[0],
      title: 'safe\u001b]8;;https://evil.invalid\u0007spoof\u001b]8;;\u0007',
      status: 'open\u009b31m'
    }
    unsafe.warnings = ['warning\u007fhidden']

    const markdown = renderFocusMarkdown(unsafe)

    expect(markdown).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/)
    expect(markdown).toContain('spoof')
    expect(markdown).toContain('open31m')
    expect(markdown).toContain('warninghidden')
  })
})

describe('local output adapters', () => {
  it('delivers through stdout without coupling the engine to the transport', async () => {
    const write = vi.fn()
    const output = new StdoutOutput('json', write)

    const receipt = await output.deliver(report())

    expect(write).toHaveBeenCalledOnce()
    expect(JSON.parse(write.mock.calls[0][0])).toEqual(report())
    expect(receipt).toMatchObject({ adapter: 'stdout', eventId: 'focus-2026-08-20' })
  })

  it('escapes terminal control characters in JSON written to stdout', async () => {
    const unsafe = report()
    unsafe.primaryFocus[0] = {
      ...unsafe.primaryFocus[0],
      title: 'safe\u009b31m\u009dclipboard\u009c\u007f'
    }
    const write = vi.fn()
    const output = new StdoutOutput('json', write)

    await output.deliver(unsafe)

    const emitted = write.mock.calls[0][0]
    expect(emitted).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/)
    expect(emitted).toContain('\\u009b')
    expect(emitted).toContain('\\u009d')
    expect(emitted).toContain('\\u009c')
    expect(emitted).toContain('\\u007f')
    expect(JSON.parse(emitted)).toEqual(unsafe)
  })

  it('writes a report through an independent file adapter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'focus-output-'))
    temporaryDirectories.push(directory)
    const target = join(directory, 'daily', 'focus.md')
    const output = new FileOutput(target, 'markdown')

    const receipt = await output.deliver(report())

    expect(await readFile(target, 'utf8')).toBe(renderFocusMarkdown(report()))
    expect(receipt).toMatchObject({ adapter: 'file', eventId: 'focus-2026-08-20', target })
  })
})
