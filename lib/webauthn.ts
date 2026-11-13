export function getWebAuthnConfig() {
  const rpID = process.env.RP_ID ?? 'localhost';
  const origin = process.env.RP_ORIGIN ?? 'http://localhost:3000';
  const rpName = process.env.RP_NAME ?? 'Todo App';
  if (process.env.NODE_ENV === 'production' && (!process.env.RP_ID || !process.env.RP_ORIGIN)) {
    throw new Error('RP_ID and RP_ORIGIN must be configured in production');
  }
  return { rpID, origin, rpName };
}

export function isUsername(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{3,32}$/.test(value);
}
