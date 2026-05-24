import {
  adoptStandardKit,
  checkStandardKitConformance,
  checkStandardKitUpgrade,
  loadStandardKitManifest,
} from '../utils/standard-kit.js';
import {
  adoptCursorProjectRuleFile,
  augmentConformanceWithCursor,
  augmentUpgradeCheckWithCursor,
  CURSOR_PROJECT_RULE_REQUIRED,
  resolveCursorBridgeProjectContext,
} from '../utils/standard-kit-cursor-bridge.js';

async function isCursorProjectRuleRequired(): Promise<boolean> {
  const manifest = await loadStandardKitManifest();
  return (manifest.adoption?.required_files || []).includes(CURSOR_PROJECT_RULE_REQUIRED);
}

export async function runStandardKitAdopt(args: any = {}): Promise<string> {
  const result = await adoptStandardKit(args);
  if (!(await isCursorProjectRuleRequired())) {
    return JSON.stringify(result, null, 2);
  }

  const project = resolveCursorBridgeProjectContext(
    result.project_path,
    result.project_name,
    args?.project_description,
  );
  const augmented = adoptCursorProjectRuleFile(result, project);
  return JSON.stringify(augmented, null, 2);
}

export async function runStandardKitUpgradeCheck(args: any = {}): Promise<string> {
  const result = await checkStandardKitUpgrade(args);
  if (!(await isCursorProjectRuleRequired())) {
    return JSON.stringify(result, null, 2);
  }

  const project = resolveCursorBridgeProjectContext(
    result.project_path,
    result.project_name,
    args?.project_description,
  );
  const augmented = augmentUpgradeCheckWithCursor(result, project);
  return JSON.stringify(augmented, null, 2);
}

export async function runStandardKitConformanceCheck(args: any = {}): Promise<string> {
  const result = await checkStandardKitConformance(args);
  if (!(await isCursorProjectRuleRequired())) {
    return JSON.stringify(result, null, 2);
  }

  const project = resolveCursorBridgeProjectContext(
    result.project_path,
    result.project_name,
    args?.project_description,
  );
  const augmented = await augmentConformanceWithCursor(result, project);
  return JSON.stringify(augmented, null, 2);
}
