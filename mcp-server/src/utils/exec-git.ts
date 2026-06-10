import { execFile } from 'child_process';

/**
 * Shell-safe git/gh execution helpers.
 *
 * All git and gh invocations must go through these helpers. They use
 * `execFile`, which passes arguments as an argv array directly to the binary
 * without a shell. This makes shell metacharacters in arguments (paths, branch
 * refs, commit messages, etc.) inert, closing the command-injection class that
 * `exec(\`git ... ${value}\`)` string interpolation opens — bash double-quotes
 * do not stop `$(...)`, backtick, or `${}` expansion.
 */

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

export interface GitExecOptions {
  cwd?: string;
  timeout?: number;
  maxBuffer?: number;
  /** When true, a non-zero exit resolves with the captured output instead of throwing. */
  allowFailure?: boolean;
}

function runExecFile(file: string, args: string[], options?: GitExecOptions): Promise<GitExecResult & { ok: boolean }> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: 'utf-8',
        cwd: options?.cwd,
        timeout: options?.timeout,
        maxBuffer: options?.maxBuffer,
      },
      (error, stdout, stderr) => {
        const out = String(stdout || '');
        const err = String(stderr || '');
        if (error) {
          if (options?.allowFailure) {
            resolve({ ok: false, stdout: out, stderr: err });
            return;
          }
          reject(Object.assign(error, { stdout: out, stderr: err }));
          return;
        }
        resolve({ ok: true, stdout: out, stderr: err });
      },
    );
  });
}

/**
 * Run `git -C <repoPath> <...args>` without a shell.
 * Returns the raw `{ stdout, stderr }`. Throws on non-zero exit unless
 * `allowFailure` is set, in which case the error output is returned with `ok:false`.
 */
export function execGit(
  repoPath: string,
  args: string[],
  options?: GitExecOptions,
): Promise<GitExecResult & { ok: boolean }> {
  return runExecFile('git', ['-C', repoPath, ...args], options);
}

/** Run `git -C <repoPath> <...args>` and return trimmed stdout. Throws on failure. */
export async function gitText(repoPath: string, args: string[], options?: GitExecOptions): Promise<string> {
  const { stdout } = await execGit(repoPath, args, options);
  return stdout.trim();
}

/** Run `gh <...args>` without a shell. Returns the raw `{ stdout, stderr }`. */
export function execGh(
  args: string[],
  options?: GitExecOptions,
): Promise<GitExecResult & { ok: boolean }> {
  return runExecFile('gh', args, options);
}

/** Run `gh <...args>` and return trimmed stdout. Throws on failure. */
export async function ghText(args: string[], options?: GitExecOptions): Promise<string> {
  const { stdout } = await execGh(args, options);
  return stdout.trim();
}
