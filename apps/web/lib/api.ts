// Cliente de API do frontend. O access token de curta duração fica em memória.
// (Em produção, prefira cookie httpOnly seguro + refresh protegido — ver docs.)
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333/api/v1';

let accessToken: string | null = null;
export function setToken(t: string | null) { accessToken = t; }
export function getToken() { return accessToken; }

async function request<T>(path: string, options: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || 'Erro na requisição';
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: any }>('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    }),
  lookup: (barcode: string) =>
    request<any>(`/inventory/variants/lookup?barcode=${encodeURIComponent(barcode)}`),
  productionEntry: (body: { barcodeOrSku: string; quantity: number }, idempotencyKey: string) =>
    request<any>('/inventory/production-entry', { method: 'POST', body: JSON.stringify(body), idempotencyKey }),
  stock: () => request<any[]>('/inventory'),
};
