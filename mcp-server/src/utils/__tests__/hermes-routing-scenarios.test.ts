import { describe, expect, it } from 'vitest';
import {
  FULL_PROJECT_WORKFLOW_REQUIREMENTS,
  HERMES_ROUTING_PATHS,
  HERMES_ROUTING_SCENARIOS,
  PROJECT_SWITCH_SUBSTITUTES,
  getHermesRoutingScenario,
  validateHermesRoutingScenarios,
  type HermesRoutingScenario,
} from '../hermes-routing-scenarios.js';

function cloneScenario(route: HermesRoutingScenario['route']): HermesRoutingScenario {
  const scenario = getHermesRoutingScenario(route);
  return {
    ...scenario,
    required_tool_calls: [...scenario.required_tool_calls],
    rejected_switch_substitutes: [...scenario.rejected_switch_substitutes],
    gbrain_policy: { ...scenario.gbrain_policy },
    workflow_requirements: [...scenario.workflow_requirements],
  };
}

describe('Hermes routing scenarios', () => {
  it('covers all five durable routing paths', () => {
    expect(HERMES_ROUTING_SCENARIOS.map((scenario) => scenario.route)).toEqual(HERMES_ROUTING_PATHS);
    expect(validateHermesRoutingScenarios(HERMES_ROUTING_SCENARIOS)).toEqual([]);
  });

  it('keeps chat-only, Hermes memory, and GBrain routes out of AgenticOS task state', () => {
    const chatOnly = getHermesRoutingScenario('chat_only');
    const hermesMemory = getHermesRoutingScenario('hermes_memory');
    const gbrainKnowledge = getHermesRoutingScenario('gbrain_knowledge');

    expect(chatOnly).toMatchObject({
      owner: 'Hermes',
      durable_write: 'none',
      requires_agenticos_mcp_first: false,
    });
    expect(hermesMemory).toMatchObject({
      owner: 'Hermes',
      durable_write: 'hermes_memory',
      requires_agenticos_mcp_first: false,
    });
    expect(gbrainKnowledge).toMatchObject({
      owner: 'GBrain',
      durable_write: 'gbrain_summary',
      requires_agenticos_mcp_first: false,
      gbrain_policy: {
        stores_distilled_summary: true,
        stores_reference_links: true,
        stores_active_agenticos_task_state: false,
        stores_full_task_board: false,
      },
    });
  });

  it('requires AgenticOS MCP before topic or project filesystem discovery', () => {
    for (const route of ['agenticos_topic', 'agenticos_project'] as const) {
      const scenario = getHermesRoutingScenario(route);
      expect(scenario.requires_agenticos_mcp_first).toBe(true);
      expect(scenario.required_tool_calls).toEqual(expect.arrayContaining(['agenticos_switch']));
      expect(scenario.rejected_switch_substitutes).toEqual(PROJECT_SWITCH_SUBSTITUTES);
    }
  });

  it('requires the full issue/worktree/PR flow for AgenticOS project routing', () => {
    const project = getHermesRoutingScenario('agenticos_project');
    expect(project.workflow_requirements).toEqual(FULL_PROJECT_WORKFLOW_REQUIREMENTS);
    expect(project.required_tool_calls).toEqual(expect.arrayContaining([
      'agenticos_issue_bootstrap',
      'agenticos_branch_bootstrap',
      'agenticos_preflight',
      'agenticos_edit_guard',
      'agenticos_pr_scope_check',
    ]));
  });

  it('reports missing routes and unsafe project switch substitutes', () => {
    const scenarios = HERMES_ROUTING_SCENARIOS
      .filter((scenario) => scenario.route !== 'chat_only')
      .map((scenario) => cloneScenario(scenario.route));
    const topic = scenarios.find((scenario) => scenario.route === 'agenticos_topic')!;
    topic.requires_agenticos_mcp_first = false;
    topic.required_tool_calls = ['cd'];
    topic.rejected_switch_substitutes = ['cd'];

    expect(validateHermesRoutingScenarios(scenarios)).toEqual(expect.arrayContaining([
      'missing route: chat_only',
      'agenticos_topic must require AgenticOS MCP before filesystem discovery',
      'agenticos_topic must require agenticos_switch or agenticos_init',
      'agenticos_topic must reject raw_directory_search as a project switch substitute',
      'agenticos_topic must reject git_branch_detection as a project switch substitute',
    ]));
  });

  it('reports GBrain task duplication and missing full-project workflow gates', () => {
    const scenarios = HERMES_ROUTING_SCENARIOS.map((scenario) => cloneScenario(scenario.route));
    const gbrain = scenarios.find((scenario) => scenario.route === 'gbrain_knowledge')!;
    gbrain.gbrain_policy = {
      stores_distilled_summary: false,
      stores_reference_links: false,
      stores_active_agenticos_task_state: true,
      stores_full_task_board: true,
    };
    const project = scenarios.find((scenario) => scenario.route === 'agenticos_project')!;
    project.workflow_requirements = ['issue_bootstrap'];

    expect(validateHermesRoutingScenarios(scenarios)).toEqual(expect.arrayContaining([
      'gbrain_knowledge must store distilled summaries',
      'gbrain_knowledge must store reference links',
      'gbrain_knowledge must not store active AgenticOS task state',
      'gbrain_knowledge must not store the AgenticOS task board',
      'agenticos_project must require isolated_worktree',
      'agenticos_project must require pull_request',
      'agenticos_project must require ci_green',
    ]));
  });

  it('fails clearly for unknown routing paths', () => {
    expect(() => getHermesRoutingScenario('unknown' as HermesRoutingScenario['route'])).toThrow(
      'Hermes routing scenario not found: unknown',
    );
  });
});
