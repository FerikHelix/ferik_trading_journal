export async function sha256Bytes(bytes: BufferSource): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function sha256Text(text: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(text));
}
