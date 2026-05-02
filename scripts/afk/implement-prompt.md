# TASK

Fix issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view`, with comments. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits, run tests, and close the issue when done.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run `bunx tsc --noEmit`, `bun run lint`, and `bun run test` to ensure type checks, lint, and tests all pass. Do not substitute `npm`/`npx`; this repo is Bun-only and has no `typecheck` script.

# COMMIT

Make a git commit following Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:` etc. — pick whichever matches the change). The message must:

1. Subject: conventional prefix + concise summary. Match the existing commit style in `git log`.
2. Body: task completed (with PRD reference if any), key decisions, blockers or notes for next iteration. Keep it concise.
3. Body must include `Closes #{{ISSUE_NUMBER}}` so GitHub auto-closes the issue when this lands on the default branch.
4. Body must end with a `[AFK]` trailer on its own line, marking this commit as produced by the AFK pipeline.

# THE ISSUE

If the task is not complete, leave a comment on the GitHub issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.
