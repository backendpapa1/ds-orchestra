/** Truncate a string to maxLen characters, appending a suffix if trimmed. */
export function truncate(str: string, maxLen: number, suffix = '…[truncated]'): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - suffix.length) + suffix;
}
