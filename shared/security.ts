const SECRET_FIELD = /(?:api[_-]?key|client[_-]?secret|bot[_-]?token|(?:^|[_-])token$|access[_-]?token|refresh[_-]?token|authorization|password|secret)/i;

/** Used for public config, exports and structured logs. Never returns credentials. */
export function publicSettings<T>(
  value: T,
  ancestors = new Set<object>(),
  clones = new Map<object, unknown>()
): T {
  if (value && typeof value === 'object') {
    if (ancestors.has(value)) return '[Circular]' as unknown as T;
    if (clones.has(value)) return clones.get(value) as T;
    ancestors.add(value);
  }
  try {
    if (Array.isArray(value)) {
      const arr: unknown[] = [];
      clones.set(value, arr);
      for (const item of value) {
        arr.push(publicSettings(item, ancestors, clones));
      }
      return arr as T;
    }
    if (value && typeof value === 'object') {
      const obj: Record<string, unknown> = Object.getPrototypeOf(value) === null ? Object.create(null) : {};
      clones.set(value, obj);
      for (const [key, val] of Object.entries(value)) {
        if (!SECRET_FIELD.test(key)) {
          Object.defineProperty(obj, key, {
            value: publicSettings(val, ancestors, clones),
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return obj as T;
    }
    return value;
  } finally {
    if (value && typeof value === 'object') {
      ancestors.delete(value);
    }
  }
}

export function redactText(text: string): string {
  return text.replace(/([?&](?:key|access_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/AIza[\w-]+/g, '[REDACTED]')
    .replace(/(Bearer\s+)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|authorization|password)\s*[=:]\s*(?:Bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]');
}
