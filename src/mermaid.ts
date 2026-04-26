import type { DerropsConventions } from './DerropsConventions.js'
import type { SegmentKey, Segments } from './types.js'

/**
 * Options for rendering a Mermaid diagram of a `DerropsConventions` hierarchy.
 *
 * The output format is a Mermaid `flowchart` with nested `subgraph` blocks — one
 * per tier listed in `groupBy`. Subgraph nesting alone communicates parent-child;
 * no explicit edges are drawn.
 */
export interface MermaidOptions {
  /** Mermaid flowchart direction. Default: `'TD'` (top-down). */
  direction?: 'TD' | 'LR' | 'BT' | 'RL'
  /**
   * When a `.with({ type })` default has been set on a node, append `type: <name>` to its
   * label. Default: `true`.
   */
  showDefaultType?: boolean
  /**
   * When `.arnContext()` has been set on the root, append the account ID (and partition,
   * if non-default) to the root label. Default: `false`.
   */
  showArnContext?: boolean
  /**
   * Append the visible tag pairs from `node.tags()` to each node label.
   * Joined with `, ` — never `;` (Mermaid treats `;` as a statement terminator).
   * Default: `false`.
   */
  showTags?: boolean
  /**
   * Segments that get their own subgraph tier. Default: `['org', 'domain', 'service']`.
   * Order matters — the renderer compares against this list to decide which segment
   * value distinguishes a node from its parent.
   */
  groupBy?: SegmentKey[]
}

const DEFAULT_GROUP_BY: SegmentKey[] = ['org', 'domain', 'service']

const ROOT_SEGMENT_LABELS: SegmentKey[] = ['region', 'env', 'org']

/**
 * Render a convention hierarchy as a Mermaid `flowchart` string.
 *
 * Walks `root` and every descendant created via `.with()`. Each node becomes a
 * `subgraph` (if it has children) or a leaf node, with the segment tier label as
 * its caption.
 *
 * Output complies with `.claude/rules/mermaid-authoring.md`:
 *  - Node IDs are restricted to `[A-Za-z0-9_]` and disambiguated on collision.
 *  - Labels with special characters are always quoted.
 *  - No `;` appears anywhere in a label.
 */
export function renderMermaid(root: DerropsConventions, options?: MermaidOptions): string {
  const direction = options?.direction ?? 'TD'
  const showDefaultType = options?.showDefaultType ?? true
  const showArnContext = options?.showArnContext ?? false
  const showTags = options?.showTags ?? false
  const groupBy = options?.groupBy ?? DEFAULT_GROUP_BY

  const lines: string[] = [`flowchart ${direction}`]
  const ids = makeIdGenerator()

  renderNode({
    node: root,
    parentSegments: {},
    lines,
    ids,
    indent: '  ',
    isRoot: true,
    options: { direction, showDefaultType, showArnContext, showTags, groupBy },
  })

  return lines.join('\n')
}

interface RenderContext {
  node: DerropsConventions
  parentSegments: Segments
  lines: string[]
  ids: IdGenerator
  indent: string
  isRoot: boolean
  options: Required<Omit<MermaidOptions, 'groupBy'>> & { groupBy: SegmentKey[] }
}

function renderNode(ctx: RenderContext): void {
  const { node, parentSegments, lines, ids, indent, isRoot, options } = ctx
  const segments = node.segments()
  const distinguishing = pickDistinguishingSegment(segments, parentSegments, options.groupBy)
  const idHint = distinguishing
    ? `${distinguishing.key}_${distinguishing.value}`
    : isRoot
      ? 'root'
      : 'node'
  const id = ids(idHint)
  const label = buildLabel({ node, segments, distinguishing, isRoot, options })
  const children = node.children()

  if (children.length === 0) {
    lines.push(`${indent}${id}["${label}"]`)
    return
  }

  lines.push(`${indent}subgraph ${id}["${label}"]`)
  lines.push(`${indent}  direction TB`)
  for (const child of children) {
    renderNode({
      node: child,
      parentSegments: segments,
      lines,
      ids,
      indent: indent + '  ',
      isRoot: false,
      options,
    })
  }
  lines.push(`${indent}end`)
}

interface DistinguishingSegment {
  key: SegmentKey
  value: string
}

/**
 * The segment that this node added relative to its parent — i.e. the rightmost
 * `groupBy` entry whose value is set on this node but not on its parent (or
 * differs from the parent's value).
 */
function pickDistinguishingSegment(
  segments: Segments,
  parentSegments: Segments,
  groupBy: SegmentKey[],
): DistinguishingSegment | undefined {
  for (let i = groupBy.length - 1; i >= 0; i--) {
    const key = groupBy[i]!
    const value = segments[key]
    if (value !== undefined && value !== parentSegments[key]) {
      return { key, value }
    }
  }
  return undefined
}

interface LabelContext {
  node: DerropsConventions
  segments: Segments
  distinguishing: DistinguishingSegment | undefined
  isRoot: boolean
  options: Required<Omit<MermaidOptions, 'groupBy'>> & { groupBy: SegmentKey[] }
}

function buildLabel(ctx: LabelContext): string {
  const { node, segments, distinguishing, isRoot, options } = ctx
  const parts: string[] = []

  if (isRoot) {
    for (const key of ROOT_SEGMENT_LABELS) {
      const value = segments[key]
      if (value !== undefined) parts.push(`${key}: ${value}`)
    }
    if (parts.length === 0 && distinguishing) {
      parts.push(`${distinguishing.key}: ${distinguishing.value}`)
    } else if (parts.length === 0) {
      parts.push('conventions')
    }
    if (options.showArnContext) {
      const ctx = node.arnContextValue()
      if (ctx) {
        parts.push(`account: ${ctx.accountId}`)
        if (ctx.partition && ctx.partition !== 'aws') parts.push(`partition: ${ctx.partition}`)
      }
    }
  } else if (distinguishing) {
    parts.push(`${distinguishing.key}: ${distinguishing.value}`)
  } else {
    // Derived instance that didn't change any groupBy segment — fall back to a generic label.
    parts.push('with(...)')
  }

  if (options.showDefaultType) {
    const t = node.defaultResourceType()
    if (t !== undefined) parts.push(`type: ${t}`)
  }

  if (options.showTags) {
    let tags: Record<string, string> = {}
    try {
      tags = node.tags()
    } catch {
      // tags() can throw when required segments are missing — silently skip in visualisation.
    }
    const pairs = Object.entries(tags).map(([k, v]) => `${k}=${v}`)
    if (pairs.length > 0) parts.push(`tags: ${pairs.join(', ')}`)
  }

  return parts.map(escapeLabel).join('<br/>')
}

/**
 * Escape characters that would break a Mermaid quoted label. Replace `"` with `&quot;`
 * (Mermaid honours HTML entities) and strip `;` per `.claude/rules/mermaid-authoring.md`.
 */
function escapeLabel(part: string): string {
  return part.replace(/"/g, '&quot;').replace(/;/g, ',')
}

type IdGenerator = (hint: string) => string

function makeIdGenerator(): IdGenerator {
  const used = new Set<string>()
  return (hint: string) => {
    const base = sanitiseId(hint) || 'node'
    if (!used.has(base)) {
      used.add(base)
      return base
    }
    let i = 2
    while (used.has(`${base}_${i}`)) i++
    const id = `${base}_${i}`
    used.add(id)
    return id
  }
}

function sanitiseId(input: string): string {
  return input.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
}
