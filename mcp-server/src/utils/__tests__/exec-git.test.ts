import { afterEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import { execGit, gitText, execGh, ghText } from '../exec-git.js';

function resolveExecFile(stdout: string, stderr = ''): void {
  execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: any) => {
    cb(null, stdout, stderr);
  });
}

describe('exec-git', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('invokes git via execFile with an argv array and no shell', async () => {
    resolveExecFile('  output  \n');
    const out = await gitText('/repo', ['rev-parse', '--show-toplevel']);

    expect(out).toBe('output');
    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('git');
    expect(args).toEqual(['-C', '/repo', 'rev-parse', '--show-toplevel']);
  });

  it('passes shell metacharacters as inert literal argv elements (no command injection)', async () => {
    resolveExecFile('');
    // A commit message that would execute under shell string interpolation.
    const maliciousMessage = 'release $(touch /tmp/agenticos_pwned) `id` "; rm -rf ~; "';
    await execGit('/repo', ['commit', '-m', maliciousMessage]);

    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('git');
    // The message must arrive as exactly one argv element, never split or expanded.
    expect(args).toEqual(['-C', '/repo', 'commit', '-m', maliciousMessage]);
    expect(args[4]).toBe(maliciousMessage);
  });

  it('passes repo paths and refs with metacharacters as literal argv elements', async () => {
    resolveExecFile('');
    const sneakyPath = '/repo/$(whoami)';
    const sneakyRef = 'origin/main; touch x';
    await execGit(sneakyPath, ['rev-parse', sneakyRef]);

    const [, args] = execFileMock.mock.calls[0];
    expect(args).toEqual(['-C', sneakyPath, 'rev-parse', sneakyRef]);
  });

  it('throws on non-zero exit with stdout/stderr attached', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: any) => {
      cb(Object.assign(new Error('boom'), {}), 'partial out', 'fatal: bad');
    });

    await expect(execGit('/repo', ['status'])).rejects.toMatchObject({
      message: 'boom',
      stdout: 'partial out',
      stderr: 'fatal: bad',
    });
  });

  it('resolves with ok:false instead of throwing when allowFailure is set', async () => {
    execFileMock.mockImplementation((_file: string, _args: string[], _opts: unknown, cb: any) => {
      cb(new Error('nonzero'), '', 'no upstream');
    });

    const result = await execGit('/repo', ['push'], { allowFailure: true });
    expect(result.ok).toBe(false);
    expect(result.stderr).toBe('no upstream');
  });

  it('invokes gh via execFile with an argv array', async () => {
    resolveExecFile('pr-output\n');
    const out = await ghText(['pr', 'view', '123', '--json', 'title']);

    expect(out).toBe('pr-output');
    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('gh');
    expect(args).toEqual(['pr', 'view', '123', '--json', 'title']);
  });

  it('passes gh arguments with metacharacters as literal argv elements', async () => {
    resolveExecFile('');
    const sneaky = '$(touch /tmp/x)';
    await execGh(['pr', 'create', '--title', sneaky]);

    const [file, args] = execFileMock.mock.calls[0];
    expect(file).toBe('gh');
    expect(args).toEqual(['pr', 'create', '--title', sneaky]);
  });
});
