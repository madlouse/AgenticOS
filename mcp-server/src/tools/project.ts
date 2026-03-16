import { loadRegistry, saveRegistry } from '../utils/registry.js';

export async function switchProject(args: any): Promise<string> {
  const { project } = args;
  const registry = await loadRegistry();

  const found = registry.projects.find(
    (p) => p.id === project || p.name === project
  );

  if (!found) {
    return `❌ Project "${project}" not found.\n\nAvailable projects:\n${registry.projects.map((p) => `- ${p.name} (${p.id})`).join('\n')}`;
  }

  registry.active_project = found.id;
  found.last_accessed = new Date().toISOString();
  await saveRegistry(registry);

  return `✅ Switched to project "${found.name}"\n\nPath: ${found.path}\nStatus: ${found.status}\n\nContext loaded from:\n- ${found.path}/.project.yaml\n- ${found.path}/.context/quick-start.md\n- ${found.path}/.context/state.yaml`;
}

export async function listProjects(): Promise<string> {
  const registry = await loadRegistry();

  if (registry.projects.length === 0) {
    return 'No projects found. Use agenticos_init to create your first project.';
  }

  const lines = ['# AgenticOS Projects\n'];

  for (const p of registry.projects) {
    const active = p.id === registry.active_project ? '🟢 ' : '';
    lines.push(`${active}**${p.name}** (${p.id})`);
    lines.push(`  Path: ${p.path}`);
    lines.push(`  Status: ${p.status}`);
    lines.push(`  Last accessed: ${p.last_accessed}\n`);
  }

  return lines.join('\n');
}
