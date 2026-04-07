/**
 * UserPromptSubmit hook: prepend the current time as additional context.
 *
 * The user sees their original message in the conversation tree; the model
 * sees the timestamp + the message.
 */

const now = new Date().toISOString();

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { additionalContext: `[Current time: ${now}]` },
  }),
);
