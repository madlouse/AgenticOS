import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { getAgenticOSHome } from './registry.js';

export interface RecordCapturePayload {
  summary: string;
  decisions: string[];
  outcomes: string[];
  pending: string[];
}

export interface AppendRecordCaptureArgs extends RecordCapturePayload {
  dir: string;
  now: Date;
}

export interface AppendedRecordCapture {
  filePath: string;
  date: string;
  time: string;
  entry: string;
}

export function getRuntimeCaptureConversationDir(projectId: string): string {
  return join(
    getAgenticOSHome(),
    '.agent-workspace',
    'projects',
    encodeURIComponent(projectId),
    'captures',
    'conversations',
  );
}

export function buildRecordCaptureEntry(args: RecordCapturePayload & { now: Date }): AppendedRecordCapture {
  const date = args.now.toISOString().split('T')[0];
  const time = args.now.toISOString().substring(11, 16);
  const sections: string[] = [];

  sections.push(`### ${time} - Session Record\n`);
  sections.push(`**Summary**: ${args.summary}\n`);
  if (args.outcomes.length > 0) {
    sections.push('**Outcomes**:');
    for (const outcome of args.outcomes) sections.push(`- ${outcome}`);
    sections.push('');
  }
  if (args.decisions.length > 0) {
    sections.push('**Decisions**:');
    for (const decision of args.decisions) sections.push(`- ${decision}`);
    sections.push('');
  }
  if (args.pending.length > 0) {
    sections.push('**Pending**:');
    for (const item of args.pending) sections.push(`- ${item}`);
    sections.push('');
  }

  return {
    filePath: '',
    date,
    time,
    entry: sections.join('\n'),
  };
}

export async function appendRecordCapture(args: AppendRecordCaptureArgs): Promise<AppendedRecordCapture> {
  await mkdir(args.dir, { recursive: true });

  const built = buildRecordCaptureEntry(args);
  const filePath = join(args.dir, `${built.date}.md`);

  let existing = '';
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {}

  const content = existing
    ? `${existing}\n\n${built.entry}`
    : `# Sessions - ${built.date}\n\n${built.entry}`;

  await writeFile(filePath, content, 'utf-8');

  return {
    ...built,
    filePath,
  };
}
