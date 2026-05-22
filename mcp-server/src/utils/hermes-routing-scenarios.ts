export const HERMES_ROUTING_PATHS = [
  'chat_only',
  'hermes_memory',
  'gbrain_knowledge',
  'agenticos_topic',
  'agenticos_project',
] as const;

export type HermesRoutingPath = typeof HERMES_ROUTING_PATHS[number];

export const PROJECT_SWITCH_SUBSTITUTES = [
  'cd',
  'raw_directory_search',
  'git_branch_detection',
  'agenticos_switch_lookup',
] as const;

export type ProjectSwitchSubstitute = typeof PROJECT_SWITCH_SUBSTITUTES[number];

export const FULL_PROJECT_WORKFLOW_REQUIREMENTS = [
  'issue_bootstrap',
  'isolated_worktree',
  'preflight',
  'edit_guard',
  'pr_scope_check',
  'pull_request',
  'ci_green',
  'merge_commit',
  'cleanup',
] as const;

export type FullProjectWorkflowRequirement = typeof FULL_PROJECT_WORKFLOW_REQUIREMENTS[number];

export interface HermesRoutingScenario {
  route: HermesRoutingPath;
  owner: 'Hermes' | 'GBrain' | 'AgenticOS';
  durable_write: 'none' | 'hermes_memory' | 'gbrain_summary' | 'agenticos_topic' | 'agenticos_project';
  requires_agenticos_mcp_first: boolean;
  required_tool_calls: string[];
  rejected_switch_substitutes: ProjectSwitchSubstitute[];
  gbrain_policy: {
    stores_distilled_summary: boolean;
    stores_reference_links: boolean;
    stores_active_agenticos_task_state: boolean;
    stores_full_task_board: boolean;
  };
  workflow_requirements: FullProjectWorkflowRequirement[];
}

export const HERMES_ROUTING_SCENARIOS: readonly HermesRoutingScenario[] = [
  {
    route: 'chat_only',
    owner: 'Hermes',
    durable_write: 'none',
    requires_agenticos_mcp_first: false,
    required_tool_calls: [],
    rejected_switch_substitutes: [],
    gbrain_policy: {
      stores_distilled_summary: false,
      stores_reference_links: false,
      stores_active_agenticos_task_state: false,
      stores_full_task_board: false,
    },
    workflow_requirements: [],
  },
  {
    route: 'hermes_memory',
    owner: 'Hermes',
    durable_write: 'hermes_memory',
    requires_agenticos_mcp_first: false,
    required_tool_calls: [],
    rejected_switch_substitutes: [],
    gbrain_policy: {
      stores_distilled_summary: false,
      stores_reference_links: false,
      stores_active_agenticos_task_state: false,
      stores_full_task_board: false,
    },
    workflow_requirements: [],
  },
  {
    route: 'gbrain_knowledge',
    owner: 'GBrain',
    durable_write: 'gbrain_summary',
    requires_agenticos_mcp_first: false,
    required_tool_calls: [],
    rejected_switch_substitutes: [],
    gbrain_policy: {
      stores_distilled_summary: true,
      stores_reference_links: true,
      stores_active_agenticos_task_state: false,
      stores_full_task_board: false,
    },
    workflow_requirements: [],
  },
  {
    route: 'agenticos_topic',
    owner: 'AgenticOS',
    durable_write: 'agenticos_topic',
    requires_agenticos_mcp_first: true,
    required_tool_calls: ['agenticos_project_ensure', 'agenticos_task_create'],
    rejected_switch_substitutes: [...PROJECT_SWITCH_SUBSTITUTES],
    gbrain_policy: {
      stores_distilled_summary: true,
      stores_reference_links: true,
      stores_active_agenticos_task_state: false,
      stores_full_task_board: false,
    },
    workflow_requirements: [],
  },
  {
    route: 'agenticos_project',
    owner: 'AgenticOS',
    durable_write: 'agenticos_project',
    requires_agenticos_mcp_first: true,
    required_tool_calls: [
      'agenticos_project_ensure',
      'agenticos_issue_bootstrap',
      'agenticos_branch_bootstrap',
      'agenticos_preflight',
      'agenticos_edit_guard',
      'agenticos_pr_scope_check',
    ],
    rejected_switch_substitutes: [...PROJECT_SWITCH_SUBSTITUTES],
    gbrain_policy: {
      stores_distilled_summary: true,
      stores_reference_links: true,
      stores_active_agenticos_task_state: false,
      stores_full_task_board: false,
    },
    workflow_requirements: [...FULL_PROJECT_WORKFLOW_REQUIREMENTS],
  },
];

export function getHermesRoutingScenario(route: HermesRoutingPath): HermesRoutingScenario {
  const scenario = HERMES_ROUTING_SCENARIOS.find((item) => item.route === route);
  if (!scenario) {
    throw new Error(`Hermes routing scenario not found: ${route}`);
  }
  return scenario;
}

export function validateHermesRoutingScenarios(scenarios: readonly HermesRoutingScenario[]): string[] {
  const problems: string[] = [];
  const routes = new Set(scenarios.map((scenario) => scenario.route));

  for (const route of HERMES_ROUTING_PATHS) {
    if (!routes.has(route)) {
      problems.push(`missing route: ${route}`);
    }
  }

  for (const scenario of scenarios) {
    const isAgenticosRoute = scenario.route === 'agenticos_topic' || scenario.route === 'agenticos_project';
    if (isAgenticosRoute && !scenario.requires_agenticos_mcp_first) {
      problems.push(`${scenario.route} must require AgenticOS MCP before filesystem discovery`);
    }
    if (isAgenticosRoute && !scenario.required_tool_calls.some((tool) => tool === 'agenticos_project_resolve' || tool === 'agenticos_project_ensure')) {
      problems.push(`${scenario.route} must require agenticos_project_resolve or agenticos_project_ensure`);
    }
    if (isAgenticosRoute) {
      for (const substitute of PROJECT_SWITCH_SUBSTITUTES) {
        if (!scenario.rejected_switch_substitutes.includes(substitute)) {
          problems.push(`${scenario.route} must reject ${substitute} as a project switch substitute`);
        }
      }
    }

    if (scenario.route === 'gbrain_knowledge') {
      if (!scenario.gbrain_policy.stores_distilled_summary) {
        problems.push('gbrain_knowledge must store distilled summaries');
      }
      if (!scenario.gbrain_policy.stores_reference_links) {
        problems.push('gbrain_knowledge must store reference links');
      }
      if (scenario.gbrain_policy.stores_active_agenticos_task_state) {
        problems.push('gbrain_knowledge must not store active AgenticOS task state');
      }
      if (scenario.gbrain_policy.stores_full_task_board) {
        problems.push('gbrain_knowledge must not store the AgenticOS task board');
      }
    }

    if (scenario.route === 'agenticos_project') {
      for (const requirement of FULL_PROJECT_WORKFLOW_REQUIREMENTS) {
        if (!scenario.workflow_requirements.includes(requirement)) {
          problems.push(`agenticos_project must require ${requirement}`);
        }
      }
    }
  }

  return problems;
}
