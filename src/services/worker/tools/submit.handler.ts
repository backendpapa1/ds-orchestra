/**
 * Submit tool handler.
 *
 * When the worker calls submit, the agent loop exits and finalization runs.
 * The submit handler itself just returns a confirmation — the real work
 * happens in the WorkerService's finalization logic.
 */
export function handleSubmit(
  args: { summary: string },
): { content: Array<{ type: 'text'; text: string }>; submit: true } {
  return {
    content: [
      {
        type: 'text',
        text: `Submitted: ${args.summary}\n\nFinalization will now run independently to verify your work.`,
      },
    ],
    submit: true,
  };
}
