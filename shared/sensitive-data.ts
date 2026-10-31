// Full Aadhaar-like identifiers are never accepted as new document references.
// Legacy references stay on disk; every read/export masks twelve-digit sequences.
const fullIdentity = /(?<!\d)(?:\d[ -]?){11}\d(?!\d)/g;
export function maskIdentityReferences(value: string) {
  return value.replace(
    fullIdentity,
    (match) => `•••• •••• ${match.replace(/\D/g, "").slice(-4)}`,
  );
}
export function containsFullIdentity(value: string) {
  return maskIdentityReferences(value) !== value;
}
