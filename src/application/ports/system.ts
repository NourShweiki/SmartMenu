/** Time and ids come through ports so use cases stay deterministic in tests. */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  newId(): string;
}

/** Random, unguessable tokens (table QR codes). 128+ bits from a cryptographically secure source. */
export interface TokenGenerator {
  newToken(): string;
}
