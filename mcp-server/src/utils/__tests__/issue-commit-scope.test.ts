import { describe, expect, it } from 'vitest';
import {
  classifyUnrelatedCommitSubjects,
  commitSubjectTargetsDifferentIssue,
  extractIssueReferences,
} from '../issue-commit-scope.js';

describe('extractIssueReferences', () => {
  it('extracts bare issue numbers from a subject', () => {
    expect(extractIssueReferences('fix: thing (#524)')).toEqual(['524']);
    expect(extractIssueReferences('feat: a (#1) and b (#2)')).toEqual(['1', '2']);
  });

  it('returns an empty list when there are no references', () => {
    expect(extractIssueReferences('chore: no refs here')).toEqual([]);
  });
});

describe('commitSubjectTargetsDifferentIssue', () => {
  it('treats "#524" and "524" issue ids as equivalent to a (#524) subject', () => {
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#524)', '#524')).toBe(false);
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#524)', '524')).toBe(false);
    expect(commitSubjectTargetsDifferentIssue('fix: thing Closes #524', '#524')).toBe(false);
  });

  it('flags a subject that references a different issue', () => {
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#999)', '#524')).toBe(true);
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#999)', '524')).toBe(true);
  });

  it('does not flag subjects with no issue reference', () => {
    expect(commitSubjectTargetsDifferentIssue('chore: cleanup', '#524')).toBe(false);
  });

  it('returns false when no issue id is provided', () => {
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#524)', '')).toBe(false);
    expect(commitSubjectTargetsDifferentIssue('fix: thing (#524)', null)).toBe(false);
  });
});

describe('classifyUnrelatedCommitSubjects', () => {
  it('returns only the subjects targeting a different issue, regardless of # prefix', () => {
    const subjects = [
      'fix: a (#524)',
      'fix: b (#999)',
      'chore: c',
    ];
    expect(classifyUnrelatedCommitSubjects(subjects, '#524')).toEqual(['fix: b (#999)']);
    expect(classifyUnrelatedCommitSubjects(subjects, '524')).toEqual(['fix: b (#999)']);
  });
});
