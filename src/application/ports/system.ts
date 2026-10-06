/** Time and ids come through ports so use cases stay deterministic in tests. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}
