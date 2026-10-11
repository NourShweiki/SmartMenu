const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a piece of text has the shape of a UUID (any version). Ids that arrive from outside are checked with this before use. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
