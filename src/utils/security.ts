// Simple cryptographic PIN hashing using Web Crypto API
export async function hashPin(rawPin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`kn_finance_salt_${rawPin}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback if crypto.subtle is unavailable (e.g. non-secure contexts in legacy browsers)
  let hash = 0;
  for (let i = 0; i < rawPin.length; i++) {
    const char = rawPin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}`;
}
