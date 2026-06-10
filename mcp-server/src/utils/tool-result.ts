export interface TextToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

const LINE_VALUE_RE_CACHE = new Map<string, RegExp>();

function lineValuePattern(key: string): RegExp {
  const cached = LINE_VALUE_RE_CACHE.get(key);
  if (cached) return cached;

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}:\\s*(.+)$`, 'm');
  LINE_VALUE_RE_CACHE.set(key, pattern);
  return pattern;
}

export function extractToolResultLineValue(text: string, key: string): string | null {
  const match = text.match(lineValuePattern(key));
  const value = match?.[1]?.trim();
  return value || null;
}

export function buildSwitchWorkdirStructuredContent(
  toolName: 'agenticos_switch' | 'agenticos_switch_out',
  text: string,
): Record<string, unknown> | null {
  if (toolName === 'agenticos_switch') {
    const projectWorkdir = extractToolResultLineValue(text, 'project_workdir');
    if (!projectWorkdir) return null;
    const explicitWorkdir = extractToolResultLineValue(text, 'explicit_workdir') || projectWorkdir;
    return {
      command: toolName,
      project_workdir: projectWorkdir,
      explicit_workdir: explicitWorkdir,
      workdir: explicitWorkdir,
      agent_must_apply_workdir: true,
    };
  }

  const targetWorkdir = extractToolResultLineValue(text, 'target_workdir');
  if (!targetWorkdir) return null;
  const explicitWorkdir = extractToolResultLineValue(text, 'explicit_workdir') || targetWorkdir;
  return {
    command: toolName,
    target_workdir: targetWorkdir,
    explicit_workdir: explicitWorkdir,
    workdir: explicitWorkdir,
    agent_must_apply_workdir: true,
  };
}

export function buildTextToolResult(
  text: string,
  structuredContent?: Record<string, unknown> | null,
): TextToolResult {
  const result: TextToolResult = {
    content: [{ type: 'text', text }],
  };
  if (structuredContent) {
    result.structuredContent = structuredContent;
  }
  return result;
}
