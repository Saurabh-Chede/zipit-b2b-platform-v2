/**
 * Recursively strips MongoDB operator keys (starting with '$' or containing '.')
 * and trims string values to protect against NoSQL injection.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.startsWith('$') || k.includes('.')) {
        continue;
      }
      clean[k] = sanitizeValue(v);
    }
    return clean;
  }
  return value;
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
