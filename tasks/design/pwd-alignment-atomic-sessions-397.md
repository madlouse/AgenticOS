# Design: PWD Alignment + Atomic Session Binding for #393/#397

## Problem Statement

Issue #394 was closed as "implemented" but core requirements from #393 remain incomplete:

1. ❌ **Atomic session state file writing** — `bindSessionProject()` only does in-memory binding
2. ❌ **`agenticos_align_pwd()` function** — No standalone function
3. ❌ **Path security validation** — No AGENTICOS_HOME or `..` traversal checks
4. ❌ **Per-agent PWD alignment instruction** — Only warning text, no actionable command

## Current Architecture

```
session-context.ts:
  bindSessionProject() → in-memory only (currentSessionProject variable)
  getSessionProjectBinding() → returns in-memory binding
  clearSessionProjectBinding() → clears in-memory

registry.ts:
  Already has atomic write with temp+rename + lock (used for registry.yaml)
  Sessions directory does NOT exist yet
```

## Design

### 1. Session State File Structure

New directory: `~/.agent-workspace/sessions/<session-id>/active-project`

```
~/.agent-workspace/
  registry.yaml
  sessions/
    <session-id>/
      active-project    # YAML file with binding info
```

### 2. New Types

```typescript
// session-context.ts

export interface SessionBindingRecord {
  projectId: string;
  projectName: string;
  projectPath: string;
  boundAt: string;
  sessionId: string;
}

export interface PwdAlignmentResult {
  binding_success: boolean;
  pwd_changed: boolean;
  pwd_alignment_instruction: string | null;
  warning: string | null;
}

export interface AlignPwdResult {
  success: boolean;
  instruction: string | null;
  warning: string | null;
}
```

### 3. Path Security Validation

```typescript
function validatePathSecurity(targetPath: string): { valid: boolean; error?: string } {
  const home = getAgenticOSHome();

  // Must be absolute
  if (!isAbsolute(targetPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  // Must be under AGENTICOS_HOME
  if (!targetPath.startsWith(home)) {
    return { valid: false, error: `Path must be under AGENTICOS_HOME (${home})` };
  }

  // Must not contain .. traversal
  const normalized = path.normalize(targetPath);
  if (normalized.includes('..')) {
    return { valid: false, error: 'Path traversal (..) is not allowed' };
  }

  return { valid: true };
}
```

### 4. Atomic Session Binding

```typescript
async function writeSessionBindingAtomic(
  sessionId: string,
  binding: SessionBindingRecord
): Promise<void> {
  const sessionsDir = join(
    getAgenticOSHome(),
    '.agent-workspace',
    'sessions',
    sessionId
  );

  // Security check
  const security = validatePathSecurity(binding.projectPath);
  if (!security.valid) {
    throw new Error(`Security validation failed: ${security.error}`);
  }

  await mkdir(sessionsDir, { recursive: true });

  const filePath = join(sessionsDir, 'active-project');
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;

  await writeFile(tempPath, yaml.stringify(binding), 'utf-8');
  await rename(tempPath, filePath);
}
```

### 5. PWD Alignment Function

```typescript
async function alignPwd(projectPath: string): Promise<AlignPwdResult> {
  // Security check
  const security = validatePathSecurity(projectPath);
  if (!security.valid) {
    return {
      success: false,
      instruction: null,
      warning: `[WARN] PWD alignment skipped: ${security.error}`
    };
  }

  // Check if directory exists and is accessible
  if (!existsSync(projectPath)) {
    return {
      success: false,
      instruction: null,
      warning: '[WARN] PWD alignment skipped: target directory does not exist'
    };
  }

  // Generate agent-specific instruction
  const agentType = detectAgentType(); // 'claude-code', 'codex', 'other'
  const isGitRepo = await checkIsGitRepo(projectPath);

  let instruction: string | null = null;

  if (agentType === 'claude-code') {
    if (isGitRepo) {
      instruction = `EnterWorktree path="${projectPath}"`;
    } else {
      instruction = `cd ${projectPath}`;
    }
  } else if (agentType === 'codex') {
    instruction = `codex -C ${projectPath}`;
  } else {
    instruction = `cd ${projectPath}`;
  }

  return {
    success: true,
    instruction,
    warning: null
  };
}

function detectAgentType(): 'claude-code' | 'codex' | 'other' {
  // Check environment or CLI presence
  if (process.env.CLAUDE_CODE !== undefined) return 'claude-code';
  if (process.env.CODEX !== undefined) return 'codex';
  return 'other';
}

async function checkIsGitRepo(dirPath: string): Promise<boolean> {
  try {
    await execAsync('git', ['-C', dirPath, 'rev-parse', '--git-dir']);
    return true;
  } catch {
    return false;
  }
}
```

### 6. Enhanced `bindSessionProject`

```typescript
export async function bindSessionProject(
  binding: Omit<SessionProjectBinding, 'boundAt'> & { boundAt?: string },
  options?: { persist?: boolean; sessionId?: string }
): Promise<SessionProjectBinding> {
  const sessionId = options?.sessionId || 'default';
  const fullBinding: SessionProjectBinding = {
    ...binding,
    boundAt: binding.boundAt || new Date().toISOString(),
  };

  // In-memory update (always)
  currentSessionProject = fullBinding;

  // Optional persistence (new behavior)
  if (options?.persist !== false) {
    const record: SessionBindingRecord = {
      ...fullBinding,
      sessionId,
    };
    await writeSessionBindingAtomic(sessionId, record);
  }

  return currentSessionProject;
}
```

### 7. Updated `switchProject` Integration

```typescript
export async function switchProject(args: any): Promise<string> {
  // ... existing validation ...

  // Bind with persistence
  await bindSessionProject({
    projectId: found.id,
    projectName: found.name,
    projectPath: found.path,
  }, { persist: true, sessionId: getCurrentSessionId() });

  // Get PWD alignment
  const pwdResult = await alignPwd(found.path);

  // Build result with instruction
  const filesystemAlignmentSummary = buildFilesystemAlignmentLines(
    found.path,
    pwdResult
  );

  // ... rest of implementation ...
}

function buildFilesystemAlignmentLines(
  projectPath: string,
  pwdResult?: AlignPwdResult
): string[] {
  const lines = [`🧰 Filesystem workdir: ${projectPath}`];

  if (pwdResult?.success && pwdResult.instruction) {
    lines.push(`📍 To align your shell PWD, run:`);
    lines.push(`   ${pwdResult.instruction}`);
  } else if (pwdResult?.warning) {
    lines.push(`⚠️ ${pwdResult.warning}`);
  } else {
    lines.push('⚠️ Project binding changed, but agenticos_switch did not change your shell cwd.');
  }

  return lines;
}
```

### 8. Backward Compatibility

- `bindSessionProject()` without options maintains current behavior (in-memory only)
- `bindSessionProject(binding, { persist: false })` explicit in-memory only
- `switchProject()` enables persistence by default
- Existing code using `bindSessionProject()` continues to work

## Security Considerations

1. **Path must be absolute** — Reject relative paths
2. **Must be under AGENTICOS_HOME** — Prevents escape to arbitrary locations
3. **No `..` traversal** — Prevents path manipulation attacks
4. **Directory accessibility check** — Validates before suggesting PWD change

## Error Handling

| Error | Behavior |
|-------|----------|
| Path outside AGENTICOS_HOME | Throw on persist, warning on align |
| `..` traversal attempt | Throw on persist, warning on align |
| Directory doesn't exist | Warning returned, no instruction |
| Directory not accessible | Warning returned, no instruction |
| Atomic write fails | Binding succeeds in-memory, warning issued |

## Test Coverage Required

1. `validatePathSecurity` — valid path, invalid path, `..` traversal
2. `writeSessionBindingAtomic` — success, security failure
3. `alignPwd` — valid dir, missing dir, security failure
4. `detectAgentType` — claude-code, codex, other
5. `bindSessionProject` with persistence — in-memory + file written
6. `switchProject` integration — result includes instruction

## Implementation Order

1. **Phase 1**: Add types and `validatePathSecurity()`
2. **Phase 2**: Implement `writeSessionBindingAtomic()`
3. **Phase 3**: Implement `alignPwd()` with agent detection
4. **Phase 4**: Update `bindSessionProject()` with persistence option
5. **Phase 5**: Update `switchProject()` to use new functions
6. **Phase 6**: Add tests for all new functions

## Related Issues

- #393 — Original design (OPEN)
- #394 — Closed as implemented (partial)
- #397 — This implementation issue
