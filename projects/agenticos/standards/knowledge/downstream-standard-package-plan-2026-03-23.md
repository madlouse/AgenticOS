# AgenticOS Downstream Standard Package Plan

> Date: 2026-03-23
> Purpose: define what should be packaged so downstream projects can inherit the executable agent protocol consistently

## 1. Problem

The project now has protocol documents and templates, but they still live as knowledge assets inside the standards project.

That is not enough for downstream adoption.

Downstream projects need a standard package that answers:
- which files are copied or generated
- which files are canonical versus customizable
- which templates are required for issue execution
- which guardrails or helper commands should accompany those templates

## 2. Package Goal

The standard package should make a downstream project operationally ready for:
- context loading
- issue-first execution
- design/critique loops
- worktree isolation for implementation
- executable acceptance and verification

## 3. Proposed Package Layers

### Layer 1: Canonical docs

- `AGENTS.md` baseline standard
- agent-specific overlay such as `CLAUDE.md`
- `.context/quick-start.md`
- `.context/state.yaml` contract

### Layer 2: Execution templates

- preflight checklist
- issue design brief
- non-code evaluation rubric
- submission evidence template

### Layer 3: Optional helper tooling

- preflight command
- branch/worktree bootstrap helper
- evaluation helper for non-code outputs

### Layer 4: Inheritance rules

- what downstream projects must keep unchanged
- what downstream projects may extend
- how template upgrades are propagated later

## 4. Recommended Packaging Direction

AgenticOS should eventually support a reusable standard package with:
- canonical template files
- version markers
- upgrade path
- helper commands for adoption and enforcement

This is the missing bridge between "we designed the protocol" and "another project can actually use it".
