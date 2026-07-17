---
name: github-git-workflow
description: Analyze changes, create conventional commits, push the branch to GitHub, and prepare a high-quality Pull Request.
---

# GitHub Git Workflow Skill

## Purpose

You are responsible for preparing code changes for review using the project's Git workflow.

Your responsibilities include:

1. Review the current changes.
2. Create an appropriate commit.
3. Push the current branch to GitHub.
4. Prepare a reviewer-friendly Pull Request description.

Always prioritize clean history, meaningful commits, and accurate summaries.

---

# Workflow

Follow these steps in order.

## Step 1 — Inspect Repository

Review the current repository state.

Inspect:

- Current branch
- Git status
- Staged files
- Unstaged files
- Commit history (if needed)
- Diff against target branch

Understand what has actually changed before creating any commit.

Never invent changes.

---

## Step 2 — Review Changes

Analyze:

- modified files
- added files
- deleted files
- renamed files

Determine:

- feature
- bug fix
- refactor
- documentation
- tests
- chore
- performance improvement

Group related changes logically.

---

## Step 3 — Validate Before Commit

Before committing, verify:

- Project builds successfully.
- Lint passes.
- Tests pass (when applicable).
- Generated files are included if required.
- No debugging code remains.
- No commented-out code.
- No temporary files.
- No secrets or credentials.
- No unnecessary formatting-only changes.

Do not commit broken code.

---

## Step 4 — Stage Files

Stage only files relevant to the change.

Avoid committing:

- local configuration
- IDE files
- logs
- cache files
- build artifacts
- temporary files

---

## Step 5 — Create Commit

Create a Conventional Commit message.

Format:

```
<type>: <summary>
```

Examples:

```
feat: add user profile page
fix: prevent duplicate invoice creation
refactor: simplify authentication flow
docs: update API documentation
test: add unit tests for user service
perf: optimize dashboard queries
chore: update dependencies
```

Rules:

- imperative mood
- lowercase type
- concise
- under 72 characters
- describe what changed

Never use vague messages like:

```
update
fix
changes
misc
wip
```

---

## Step 6 — Push Branch

Push only the current working branch.

Never push directly to:

- main
- master
- develop
- production

If working on a protected branch, stop and explain why.

Use the existing upstream if configured.

Otherwise push with upstream.

Example:

```bash
git push -u origin <branch>
```

---

## Step 7 — Prepare Pull Request

Generate a GitHub-ready Pull Request description.

Do not invent information.

Use only verified changes.

---

# Pull Request Format

## Title

Use the same style as Conventional Commits.

Example:

```
feat: support workspace invitations
```

---

## Description

```md
## Summary

Brief description of the purpose of this PR.

## Changes

- Added ...
- Updated ...
- Fixed ...

## Why

Explain the motivation behind these changes.

## Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

### Verification

Describe how the feature was tested.

## Screenshots

Include screenshots for UI changes if applicable.

## Breaking Changes

None

## Checklist

- [x] Code follows project conventions
- [x] Self reviewed
- [x] Tests updated if needed
- [x] Documentation updated if needed
```

---

# Commit Quality

A commit should represent one logical unit of work.

Avoid mixing unrelated changes.

Split unrelated work into separate commits whenever practical.

---

# Generated Files

If the project uses generated code:

- ensure generated files are regenerated
- include generated files only when required by the project
- never manually edit generated files

---

# Reviewer Experience

Optimize for reviewers.

Summaries should answer:

- What changed?
- Why was it changed?
- What should reviewers focus on?

Avoid describing implementation details unless necessary.

---

# Safety Rules

Never:

- force push (`git push --force`) unless explicitly instructed
- rewrite published history unless explicitly instructed
- push directly to protected branches
- commit secrets, tokens, passwords, or credentials
- commit build artifacts unless required by the project

---

# If Conflicts Exist

If merge conflicts or rebase conflicts are detected:

- stop
- explain the issue
- recommend resolving conflicts before committing or opening a PR

Do not guess conflict resolutions.

---

# If the Working Tree Is Dirty

If unrelated changes exist:

- identify them
- recommend separating them into another commit
- avoid mixing unrelated work

---

# Pull Request Principles

Every PR should be:

- focused
- easy to review
- small when possible
- accurately documented
- fully tested

---

# Golden Rules

- Never invent changes.
- Never fabricate test results.
- Never fabricate screenshots.
- Never create misleading commit messages.
- Never push directly to protected branches.
- Always inspect the diff before committing.
- Always use Conventional Commits.
- Always produce a reviewer-friendly Pull Request description.