import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { alignPwd, bindSessionProject, checkIsGitRepo, clearSessionProjectBinding, getSessionProjectBinding, shellQuote, validatePathSecurity, validatePathInAgenticosHome } from '../session-context.js';

const execFileMock = vi.hoisted(() => vi.fn());
const agenticosHomeMock = vi.hoisted(() => ({ value: '/test/home' }));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('../registry.js', () => ({
  getAgenticOSHome: () => agenticosHomeMock.value,
}));

describe('session-context', () => {
  const originalClaudeCode = process.env.CLAUDE_CODE;
  const originalCodex = process.env.CODEX;
  const originalCodexCi = process.env.CODEX_CI;
  const originalCodexThreadId = process.env.CODEX_THREAD_ID;
  const originalCodexManagedByNpm = process.env.CODEX_MANAGED_BY_NPM;

  beforeEach(() => {
    clearSessionProjectBinding();
    delete process.env.CLAUDE_CODE;
    delete process.env.CODEX;
    delete process.env.CODEX_CI;
    delete process.env.CODEX_THREAD_ID;
    delete process.env.CODEX_MANAGED_BY_NPM;
    agenticosHomeMock.value = '/test/home';
    execFileMock.mockReset();
    execFileMock.mockImplementation((command: string, args: string[], callback: (error: Error | null, stdout?: string) => void) => {
      if (command === 'sh') {
        const match = String(args[1]).match(/^cd "(.+)" && pwd$/);
        callback(null, `${match?.[1] || ''}\n`);
        return;
      }

      callback(new Error('not a git repo'));
    });
  });

  afterEach(() => {
    if (originalClaudeCode === undefined) {
      delete process.env.CLAUDE_CODE;
    } else {
      process.env.CLAUDE_CODE = originalClaudeCode;
    }
    if (originalCodex === undefined) {
      delete process.env.CODEX;
    } else {
      process.env.CODEX = originalCodex;
    }
    if (originalCodexCi === undefined) {
      delete process.env.CODEX_CI;
    } else {
      process.env.CODEX_CI = originalCodexCi;
    }
    if (originalCodexThreadId === undefined) {
      delete process.env.CODEX_THREAD_ID;
    } else {
      process.env.CODEX_THREAD_ID = originalCodexThreadId;
    }
    if (originalCodexManagedByNpm === undefined) {
      delete process.env.CODEX_MANAGED_BY_NPM;
    } else {
      process.env.CODEX_MANAGED_BY_NPM = originalCodexManagedByNpm;
    }
  });

  describe('bindSessionProject', () => {
    it('stores binding with current timestamp', () => {
      const binding = bindSessionProject({
        projectId: 'p1',
        projectName: 'Test Project',
        projectPath: '/test/path',
      });
      expect(binding.projectId).toBe('p1');
      expect(binding.projectName).toBe('Test Project');
      expect(binding.projectPath).toBe('/test/path');
      expect(binding.boundAt).toBeTruthy();
    });

    it('uses provided boundAt if given', () => {
      const binding = bindSessionProject({
        projectId: 'p1',
        projectName: 'Test Project',
        projectPath: '/test/path',
        boundAt: '2026-01-01T00:00:00.000Z',
      });
      expect(binding.boundAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('getSessionProjectBinding', () => {
    it('returns null when no binding', () => {
      expect(getSessionProjectBinding()).toBeNull();
    });

    it('returns current binding after bindSessionProject', () => {
      bindSessionProject({
        projectId: 'p1',
        projectName: 'Test Project',
        projectPath: '/test/path',
      });
      const binding = getSessionProjectBinding();
      expect(binding?.projectId).toBe('p1');
    });
  });

  describe('clearSessionProjectBinding', () => {
    it('clears the current binding', () => {
      bindSessionProject({
        projectId: 'p1',
        projectName: 'Test Project',
        projectPath: '/test/path',
      });
      clearSessionProjectBinding();
      expect(getSessionProjectBinding()).toBeNull();
    });
  });

  describe('validatePathSecurity', () => {
    it('rejects relative paths', () => {
      const result = validatePathSecurity('relative/path');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('rejects path with .. after normalization', () => {
      // Path that contains .. that doesn't resolve away
      const result = validatePathSecurity('/test/../test2');
      expect(result.valid).toBe(true); // after normalization, no ..
    });

    it('accepts absolute paths', () => {
      const result = validatePathSecurity('/absolutely/safe/path');
      expect(result.valid).toBe(true);
    });

    it('rejects absolute paths whose normalized form still contains traversal text', () => {
      const result = validatePathSecurity('/safe/..hidden');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });
  });

  describe('validatePathInAgenticosHome', () => {
    it('rejects relative paths', () => {
      const result = validatePathInAgenticosHome('relative/path');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('absolute');
    });

    it('accepts path after normalization', () => {
      const result = validatePathInAgenticosHome('/test/home/../other');
      expect(result.valid).toBe(true);
    });

    it('warns when path is outside AGENTICOS_HOME', () => {
      const result = validatePathInAgenticosHome('/other/path');
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('not under AGENTICOS_HOME');
    });

    it('accepts path inside AGENTICOS_HOME', () => {
      const result = validatePathInAgenticosHome('/test/home/project');
      expect(result.valid).toBe(true);
    });

    it('rejects paths whose normalized form still contains traversal text', () => {
      const result = validatePathInAgenticosHome('/safe/..hidden');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('traversal');
    });
  });

  describe('alignPwd', () => {
    it('shell-quotes paths for copyable instructions', () => {
      expect(shellQuote('')).toBe("''");
      expect(shellQuote('/tmp/simple')).toBe("'/tmp/simple'");
      expect(shellQuote('/tmp/work space')).toBe("'/tmp/work space'");
      expect(shellQuote("/tmp/project's path")).toBe("'/tmp/project'\\''s path'");
      expect(shellQuote('/tmp/a; echo hacked $(pwd)')).toBe("'/tmp/a; echo hacked $(pwd)'");
    });

    it('rejects paths with control characters before rendering guidance', async () => {
      const result = await alignPwd('/tmp/project\nINJECT');

      expect(result.success).toBe(false);
      expect(result.instruction).toBeNull();
      expect(result.warning).toContain('control characters');
    });

    it('returns failure for relative path', async () => {
      const result = await alignPwd('relative/path');
      expect(result.success).toBe(false);
      expect(result.instruction).toBeNull();
      expect(result.warning).toContain('must be absolute');
    });

    it('returns failure when directory does not exist', async () => {
      const result = await alignPwd('/nonexistent/directory/path');
      expect(result.success).toBe(false);
      expect(result.instruction).toBeNull();
      expect(result.warning).toContain('does not exist');
    });

    it('returns instruction with warning for accessible directory outside AGENTICOS_HOME', async () => {
      const result = await alignPwd('/tmp');
      expect(result.success).toBe(true);
      expect(result.instruction).toContain("cd '/tmp'");
      expect(result.warning).toContain('not under AGENTICOS_HOME');
    });

    it('uses path containment instead of raw prefix matching for AGENTICOS_HOME warnings', async () => {
      agenticosHomeMock.value = join(tmpdir(), 'agenticos');
      const projectPath = join(tmpdir(), 'agenticos-evil');
      mkdirSync(projectPath, { recursive: true });
      const result = await alignPwd(projectPath);

      expect(result.success).toBe(true);
      expect(result.warning).toContain('not under AGENTICOS_HOME');
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('returns null warning for accessible directory inside AGENTICOS_HOME', async () => {
      agenticosHomeMock.value = '/tmp';

      const result = await alignPwd('/tmp');

      expect(result.success).toBe(true);
      expect(result.instruction).toBe("cd '/tmp'");
      expect(result.warning).toBeNull();
    });

    it('returns Claude Code cd instruction when CLAUDE_CODE is set', async () => {
      process.env.CLAUDE_CODE = '1';

      const result = await alignPwd('/tmp');

      expect(result.success).toBe(true);
      expect(result.instruction).toBe("cd '/tmp'");
      expect(result.instructionKind).toBe('current-session');
    });

    it('returns Codex startup instruction when CODEX is set', async () => {
      process.env.CODEX = '1';

      const result = await alignPwd('/tmp');

      expect(result.success).toBe(true);
      expect(result.instruction).toBe("codex -C '/tmp'");
      expect(result.instructionKind).toBe('new-session');
    });

    it('escapes shell metacharacters in Claude Code instructions', async () => {
      process.env.CLAUDE_CODE = '1';
      const projectPath = join(tmpdir(), "agenticos work space/project's; echo hacked $(pwd)");
      mkdirSync(projectPath, { recursive: true });

      const result = await alignPwd(projectPath);

      expect(result.success).toBe(true);
      expect(result.instruction).toBe(`cd ${shellQuote(projectPath)}`);
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('escapes shell metacharacters in Codex startup instructions', async () => {
      process.env.CODEX = '1';
      const projectPath = join(tmpdir(), "agenticos codex space/project's; echo hacked $(pwd)");
      mkdirSync(projectPath, { recursive: true });

      const result = await alignPwd(projectPath);

      expect(result.success).toBe(true);
      expect(result.instruction).toBe(`codex -C ${shellQuote(projectPath)}`);
      rmSync(projectPath, { recursive: true, force: true });
    });

    it('does not shell-verify accessible directories', async () => {
      execFileMock.mockImplementation((command: string, _args: string[], callback: (error: Error | null, stdout?: string) => void) => {
        if (command === 'sh') {
          callback(new Error('permission denied'));
          return;
        }

        callback(new Error('not a git repo'));
      });

      const result = await alignPwd('/tmp');

      expect(result.success).toBe(true);
      expect(result.instruction).toBe("cd '/tmp'");
      expect(result.warning).toContain('not under AGENTICOS_HOME');
    });
  });

  describe('checkIsGitRepo', () => {
    it('returns true when git rev-parse succeeds', async () => {
      execFileMock.mockImplementation((command: string, _args: string[], callback: (error: Error | null) => void) => {
        expect(command).toBe('git');
        callback(null);
      });

      await expect(checkIsGitRepo('/repo')).resolves.toBe(true);
    });

    it('returns false when git rev-parse fails', async () => {
      execFileMock.mockImplementation((command: string, _args: string[], callback: (error: Error | null) => void) => {
        expect(command).toBe('git');
        callback(new Error('not a git repo'));
      });

      await expect(checkIsGitRepo('/repo')).resolves.toBe(false);
    });
  });
});
