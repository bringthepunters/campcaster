CONSTITUTION
# Project Constitution

This document defines the non-negotiable rules for every change in this repo (human or AI-authored). It is the primary source of truth for engineering standards.

## 1) Prime Directive

- **Do the smallest correct thing**: prefer minimal, high-leverage changes over sweeping refactors.
- **Correctness > cleverness**: choose the most readable solution that satisfies requirements.
- **Maintainability is a feature**: optimize for future edits by someone unfamiliar with the codebase.
- **No blind optimism**: challenge assumptions and call out likely-unfruitful technical approaches.

## 2) Testing and TDD

- **Test-Driven Development (TDD) is the default**:
  - Write/adjust tests to express intended behavior **before** implementing or changing behavior.
  - For bugs: add a failing regression test first, then fix.
- **Minimal but effective tests**:
  - Prefer a small number of high-signal tests over broad coverage.
  - At the end of each story, review the full test suite and remove any tests that are no longer useful.
- **Never cheat on tests**:
  - Do not weaken assertions to make tests pass.
  - Do not delete tests to “unblock” progress unless the spec explicitly removed the behavior.
  - Do not add `skip`, `only`, or “temporary” disables in committed code.
  - Do not mock/stub the unit under test in a way that hides real behavior.
- **Test levels are intentional**:
  - Unit tests for logic (fast, deterministic, minimal dependencies).
  - Integration tests for boundaries (DB/network/filesystem) with realistic wiring.
  - End-to-end tests only for critical user journeys.
- **Test quality rules**:
  - Tests must be deterministic: no reliance on wall-clock, randomness, network, or shared global state.
  - Prefer black-box assertions (inputs/outputs) over implementation-detail assertions.
  - Each test should communicate: *arrange → act → assert*.
- **Definition of Done includes tests**:
  - A change is not “done” unless tests cover the new/changed behavior and all tests pass locally and in CI.

## 3) Architecture and Boundaries

- **Keep boundaries clean**:
  - Separate **domain/business logic** from **I/O** (UI, network, DB, filesystem).
  - Business rules should be testable without UI frameworks or external services.
- **Dependencies point inward**:
  - High-level modules do not depend on low-level details; depend on interfaces where useful.
- **Single responsibility**:
  - Modules/classes/functions should do one thing; compose rather than grow.
- **Prefer boring architecture**:
  - Avoid introducing new patterns, frameworks, or abstractions unless the current approach cannot meet the spec.

## 4) UI Principles (if applicable)

- **Consistency beats novelty**:
  - Reuse existing components/patterns and follow the established design system.
- **Responsive by default**:
  - Must work well on phone and desktop browser viewports.
- **Accessibility is required**:
  - Keyboard navigation, focus states, labels, sensible semantics, and contrast must be considered.
- **Performance and UX**:
  - Avoid unnecessary re-renders, heavy dependencies, and large bundles.
  - Prefer progressive disclosure and clear error states over dense screens.
- **No visual regressions**:
  - If a UI change is user-visible, include an appropriate safeguard (tests, snapshots, or documented before/after).

## 5) Clean Code Standards

- **Clarity first**:
  - Prefer descriptive names over comments.
  - Comments explain *why*, not *what* (unless the “what” is non-obvious).
- **Small functions and small files**:
  - Keep cognitive load low; refactor when a unit becomes hard to reason about.
- **Error handling is explicit**:
  - Fail fast with actionable messages.
  - Never silently swallow errors.
- **No dead code**:
  - Remove unused code paths and unused exports (unless intentionally staged and documented).

## 6) Minimal Change Policy

When implementing a spec or task:
- **Do not refactor adjacent code “while you’re here”** unless it is necessary for the change.
- **Avoid broad rewrites**:
  - Prefer surgical edits and incremental improvements.
- **Keep diffs reviewable**:
  - If a change becomes large, split into smaller commits or smaller tasks.

## 7) Documentation and Decisions

- **Document intent at the right level**:
  - Public API / user-facing behavior must be documented where users will find it.
  - Non-obvious architectural decisions get a short note (ADR-style or in relevant docs).
- **Keep docs in sync**:
  - If behavior changes, update docs in the same change set.

## 8) Security and Data Safety (baseline)

- Validate external inputs and handle untrusted data defensively.
- Do not log secrets or sensitive user data.
- Prefer least-privilege access patterns and secure defaults.

## 9) Tooling and Workflow

- Keep linting/formatting automated and consistent.
- CI must be green before merging.
- If constraints conflict, follow this order:
  1) Spec requirements
  2) This constitution
  3) Existing repo conventions
  4) Challenge plans that look wrongheaded before proceeding.

## 10) Amendments

- Amend this constitution deliberately.
- Any amendment must:
  - explain the reason,
  - describe impact on future changes,
  - and (where relevant) update templates / CI expectations.
