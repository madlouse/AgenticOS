/// <reference types="vitest/globals" />
import { describe, expect, it } from 'vitest';
import {
  parsePrUrl,
  detectProvider,
  buildPrUrl,
} from '../git-policy-enforce.js';

describe('URL parsing', () => {
  it('parses GitHub PR URL', () => {
    const result = parsePrUrl('https://github.com/AgenticOS/agenticos-mcp/pull/345');
    expect(result).toEqual({ repo: 'AgenticOS/agenticos-mcp', number: 345 });
  });

  it('parses GitHub PR URL with extra path', () => {
    const result = parsePrUrl('https://github.com/my-org/my_repo/pull/123/files');
    expect(result).toEqual({ repo: 'my-org/my_repo', number: 123 });
  });

  it('parses GitLab MR URL', () => {
    const result = parsePrUrl('https://gitlab.com/my-org/my-repo/-/merge_requests/42');
    expect(result).toEqual({ repo: 'my-org/my-repo', number: 42 });
  });

  it('parses GitLab with subgroups', () => {
    const result = parsePrUrl('https://gitlab.com/org/subgroup/project/-/merge_requests/7');
    expect(result).toEqual({ repo: 'org/subgroup/project', number: 7 });
  });

  it('returns null for invalid URL', () => {
    expect(parsePrUrl('https://bitbucket.org/org/repo/pull/1')).toBeNull();
    expect(parsePrUrl('https://github.com/org/repo')).toBeNull();
    expect(parsePrUrl('not-a-url')).toBeNull();
  });
});

describe('Provider detection', () => {
  it('detects github from URL', () => {
    expect(detectProvider('https://github.com/org/repo/pull/1')).toBe('github');
  });

  it('detects gitlab from URL', () => {
    expect(detectProvider('https://gitlab.com/org/repo/-/merge_requests/1')).toBe('gitlab');
  });

  it('respects explicit provider', () => {
    expect(detectProvider('https://gitlab.com/org/repo/pull/1', 'github')).toBe('github');
    expect(detectProvider(undefined, 'gitlab')).toBe('gitlab');
  });

  it('defaults to github', () => {
    expect(detectProvider(undefined, undefined)).toBe('github');
  });
});

describe('PR URL building', () => {
  it('builds GitHub PR URL', () => {
    expect(buildPrUrl('github', 'owner/repo', 123)).toBe('https://github.com/owner/repo/pull/123');
  });

  it('builds GitLab MR URL', () => {
    expect(buildPrUrl('gitlab', 'owner/repo', 42)).toBe('https://gitlab.com/owner/repo/-/merge_requests/42');
  });
});
