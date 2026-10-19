/** View の tool 呼び出しと resource の読み込みを、web の Worker（/api/mcp）経由で apps/api に送る */
export async function relay(token: string, method: 'tools/call' | 'resources/read', params: unknown): Promise<unknown> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, params }),
  })
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!res.ok) throw new Error(body.error?.message ?? `取得に失敗しました（${res.status}）`)
  return body
}
