function normalizeIssueId(issueId: string | undefined | null): string {
  // Strip a leading '#' so "#524" and "524" compare equal against issue
  // references extracted from commit subjects (which never include the '#').
  return (issueId || '').trim().replace(/^#+/, '');
}

export function extractIssueReferences(subject: string): string[] {
  const matches = subject.matchAll(/(^|[^\w])#(\d+)\b/g);
  const refs = new Set<string>();
  for (const match of matches) {
    if (match[2]) refs.add(match[2]);
  }
  return Array.from(refs);
}

export function commitSubjectTargetsDifferentIssue(subject: string, issueId: string | undefined | null): boolean {
  const normalizedIssueId = normalizeIssueId(issueId);
  if (!normalizedIssueId) return false;

  const refs = extractIssueReferences(subject);
  if (refs.length === 0) return false;

  return !refs.includes(normalizedIssueId);
}

export function classifyUnrelatedCommitSubjects(
  subjects: string[],
  issueId: string | undefined | null,
): string[] {
  return subjects.filter((subject) => commitSubjectTargetsDifferentIssue(subject, issueId));
}
