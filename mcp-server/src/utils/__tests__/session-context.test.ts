import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const fsPromisesMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  writeFile: vi.fn(),
  rm: vi.fn(),
}));
const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(),
}));
const execFileMock = vi.hoisted(() => vi.fn());
const yamlMock = vi.hoisted(() => ({
  parse: vi.fn(),
  stringify: vi.fn((value: unknown) => JSON.stringify(value)),
}));

vi.mock('fs/promises', () => fsPromisesMock);

vi.mock('fs', () => ({
  existsSync: fsMock.existsSync,
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('yaml', () => ({
  default: yamlMock,
}));

vi.mock('../registry.js', () => ({
  getAgenticOSHome: vi.fn(() => '/home/testuser/AgenticOS'),
}));

import {
  alignPwd,
  bindSessionProject,
  bindSessionProjectAsync,
  clearSessionProjectBinding,
  detectAgentType,
  getSessionBinding,
  getSessionProjectBinding,
  validatePathInAgenticosHome,
  validatePathSecurity,
} from '../session-context.js';

const envKeys = ['CLAUDE_CODE', 'CODEX', 'CODEX_CI', 'CODEX_THREAD_ID', 'CODEX_MANAGED_BY_NPM'] as const;
const originalEnv = new Map<string, string | undefined>();

function restoreRuntimeEnv(): void {
  for (const key of envKeys) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function mockGitCheck(isGitRepo: boolean): void {
  execFileMock.mockImplementation(
    (_command: string, _args: string[], callback: (error: Error | null) => void) => {
      callback(isGitRepo ? null : new Error('not a git repo'));
    },
  );
}

describe('session-context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionProjectBinding();
    for (const key of envKeys) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    fsMock.existsSync.mockReturnValue(false);
    fsPromisesMock.mkdir.mockResolvedValue(undefined);
    fsPromisesMock.readFile.mockResolvedValue('');
    fsPromisesMock.rename.mockResolvedValue(undefined);
    fsPromisesMock.writeFile.mockResolvedValue(undefined);
    fsPromisesMock.rm.mockResolvedValue(undefined);
    yamlMock.parse.mockImplementation((content: string) => JSON.parse(content));
    yamlMock.stringify.mockImplementation((value: unknown) => JSON.stringify(value));
    mockGitCheck(true);
    vi.spyOn(process, 'cwd').mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreRuntimeEnv();
    clearSessionProjectBinding();
  });

  it('binds and clears the in-memory session project', () => {
    const binding = bindSessionProject({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
      boundAt: '2026-05-17T00:00:00.000Z',
    });

    expect(binding.boundAt).toBe('2026-05-17T00:00:00.000Z');
    expect(getSessionProjectBinding()).toEqual(binding);

    clearSessionProjectBinding();

    expect(getSessionProjectBinding()).toBeNull();
  });

  it('uses the current timestamp when synchronously binding without boundAt', () => {
    const binding = bindSessionProject({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    });

    expect(binding.boundAt).toEqual(expect.any(String));
  });

  it('persists a session binding atomically by default', async () => {
    const binding = await bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
      boundAt: '2026-05-17T00:00:00.000Z',
    }, { sessionId: 'codex-thread' });

    expect(binding.projectId).toBe('agenticos');
    expect(fsPromisesMock.mkdir).toHaveBeenCalledWith('/home/testuser/AgenticOS/.agent-workspace/sessions/codex-thread.lock');
    expect(fsPromisesMock.mkdir).toHaveBeenCalledWith(
      '/home/testuser/AgenticOS/.agent-workspace/sessions/codex-thread',
      { recursive: true },
    );
    expect(fsPromisesMock.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/active-project.tmp-'),
      expect.stringContaining('"sessionId":"codex-thread"'),
      'utf-8',
    );
    expect(fsPromisesMock.rename).toHaveBeenCalledWith(
      expect.stringContaining('/active-project.tmp-'),
      '/home/testuser/AgenticOS/.agent-workspace/sessions/codex-thread/active-project',
    );
    expect(fsPromisesMock.rm).toHaveBeenCalledWith(
      '/home/testuser/AgenticOS/.agent-workspace/sessions/codex-thread.lock',
      { recursive: true, force: true },
    );
  });

  it('can bind without persisting when requested', async () => {
    const binding = await bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    }, { persist: false });

    expect(binding.boundAt).toEqual(expect.any(String));
    expect(getSessionProjectBinding()?.projectId).toBe('agenticos');
    expect(fsPromisesMock.writeFile).not.toHaveBeenCalled();
  });

  it('rejects persisted bindings with relative paths', async () => {
    await expect(bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: 'relative/path',
    })).rejects.toThrow('Security validation failed: Path must be absolute');
  });

  it('retries lock acquisition and fails after repeated lock conflicts', async () => {
    vi.useFakeTimers();
    fsPromisesMock.mkdir.mockRejectedValue(new Error('locked'));

    const promise = bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    });
    const assertion = expect(promise).rejects.toThrow('failed to acquire session lock for default');

    await vi.runAllTimersAsync();
    await assertion;
    vi.useRealTimers();
  });

  it('cleans up temp files and lock directories when atomic writes fail', async () => {
    fsPromisesMock.writeFile.mockRejectedValueOnce(new Error('disk full'));

    await expect(bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    }, { sessionId: 'default' })).rejects.toThrow('disk full');

    expect(fsPromisesMock.rm).toHaveBeenCalledWith(expect.stringContaining('/active-project.tmp-'), { force: true });
    expect(fsPromisesMock.rm).toHaveBeenCalledWith(
      '/home/testuser/AgenticOS/.agent-workspace/sessions/default.lock',
      { recursive: true, force: true },
    );
  });

  it('preserves the original atomic write error when temp cleanup also fails', async () => {
    fsPromisesMock.writeFile.mockRejectedValueOnce(new Error('disk full'));
    fsPromisesMock.rm
      .mockRejectedValueOnce(new Error('temp cleanup failed'))
      .mockResolvedValueOnce(undefined);

    await expect(bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    })).rejects.toThrow('disk full');
  });

  it('ignores lock cleanup errors after successful callback execution', async () => {
    fsPromisesMock.rm.mockRejectedValueOnce(new Error('cleanup failed'));

    await expect(bindSessionProjectAsync({
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
    })).resolves.toMatchObject({ projectId: 'agenticos' });
  });

  it('returns persisted session binding when the active-project file is readable', async () => {
    const record = {
      projectId: 'agenticos',
      projectName: 'AgenticOS',
      projectPath: '/home/testuser/AgenticOS/projects/agenticos',
      boundAt: '2026-05-17T00:00:00.000Z',
      sessionId: 'codex-thread',
    };
    fsMock.existsSync.mockReturnValue(true);
    fsPromisesMock.readFile.mockResolvedValue(JSON.stringify(record));

    await expect(getSessionBinding('codex-thread')).resolves.toEqual(record);
  });

  it('returns null when no persisted binding exists or parsing fails', async () => {
    fsMock.existsSync.mockReturnValue(false);
    await expect(getSessionBinding('missing')).resolves.toBeNull();

    fsMock.existsSync.mockReturnValue(true);
    fsPromisesMock.readFile.mockRejectedValueOnce(new Error('unreadable'));
    await expect(getSessionBinding('broken')).resolves.toBeNull();
  });

  it('validates absolute paths and rejects relative or traversing paths', () => {
    expect(validatePathSecurity('/home/testuser/project')).toEqual({ valid: true });
    expect(validatePathSecurity('relative/project')).toEqual({ valid: false, error: 'Path must be absolute' });
    expect(validatePathSecurity('/home/testuser/..hidden/project')).toEqual({
      valid: false,
      error: 'Path traversal (..) is not allowed',
    });
  });

  it('warns when an absolute path is outside AGENTICOS_HOME', () => {
    expect(validatePathInAgenticosHome('relative/project')).toEqual({ valid: false, error: 'Path must be absolute' });
    expect(validatePathInAgenticosHome('/home/testuser/..hidden/project')).toEqual({
      valid: false,
      error: 'Path traversal (..) is not allowed',
    });
    expect(validatePathInAgenticosHome('/tmp/project')).toEqual({
      valid: true,
      warning: 'Path is not under AGENTICOS_HOME (/home/testuser/AgenticOS)',
    });
    expect(validatePathInAgenticosHome('/home/testuser/AgenticOS/projects/agenticos')).toEqual({ valid: true });
  });

  it('detects Claude Code before Codex and detects current Codex runtime env vars', () => {
    expect(detectAgentType()).toBe('other');

    process.env.CODEX_CI = '1';
    expect(detectAgentType()).toBe('codex');

    delete process.env.CODEX_CI;
    process.env.CODEX_THREAD_ID = 'thread';
    expect(detectAgentType()).toBe('codex');

    delete process.env.CODEX_THREAD_ID;
    process.env.CODEX_MANAGED_BY_NPM = '1';
    expect(detectAgentType()).toBe('codex');

    process.env.CLAUDE_CODE = '1';
    expect(detectAgentType()).toBe('claude-code');
  });

  it('reports invalid or missing paths without claiming cwd alignment', async () => {
    await expect(alignPwd('relative/path')).resolves.toMatchObject({
      success: false,
      agentType: 'other',
      instruction: null,
      instructionKind: null,
      warning: '[WARN] PWD alignment skipped: Path must be absolute',
      observedMcpProcessPwd: '/home/testuser',
    });

    fsMock.existsSync.mockReturnValue(false);
    await expect(alignPwd('/home/testuser/AgenticOS/projects/missing')).resolves.toMatchObject({
      success: false,
      instruction: null,
      warning: '[WARN] PWD alignment skipped: target directory does not exist',
      observedMcpProcessPwd: '/home/testuser',
    });
  });

  it('builds Claude Code alignment instructions for git and non-git targets', async () => {
    process.env.CLAUDE_CODE = '1';
    fsMock.existsSync.mockReturnValue(true);
    mockGitCheck(true);

    await expect(alignPwd('/home/testuser/AgenticOS/projects/agenticos')).resolves.toMatchObject({
      success: true,
      agentType: 'claude-code',
      instruction: 'EnterWorktree path="/home/testuser/AgenticOS/projects/agenticos"',
      instructionKind: 'current-session',
      warning: null,
    });

    mockGitCheck(false);
    await expect(alignPwd('/home/testuser/AgenticOS/projects/notes')).resolves.toMatchObject({
      success: true,
      agentType: 'claude-code',
      instruction: 'cd /home/testuser/AgenticOS/projects/notes',
      instructionKind: 'manual-cd',
    });
  });

  it('builds Codex new-session instructions without implying current-session cwd mutation', async () => {
    process.env.CODEX_THREAD_ID = 'thread';
    fsMock.existsSync.mockReturnValue(true);

    await expect(alignPwd('/home/testuser/AgenticOS/projects/agenticos')).resolves.toMatchObject({
      success: true,
      agentType: 'codex',
      instruction: 'codex -C /home/testuser/AgenticOS/projects/agenticos',
      instructionKind: 'new-session',
      observedMcpProcessPwd: '/home/testuser',
    });
  });

  it('uses manual cd for unknown agents and carries AGENTICOS_HOME warnings', async () => {
    fsMock.existsSync.mockReturnValue(true);

    await expect(alignPwd('/tmp/project')).resolves.toMatchObject({
      success: true,
      agentType: 'other',
      instruction: 'cd /tmp/project',
      instructionKind: 'manual-cd',
      warning: 'Path is not under AGENTICOS_HOME (/home/testuser/AgenticOS)',
      observedMcpProcessPwd: '/home/testuser',
    });
  });
});
