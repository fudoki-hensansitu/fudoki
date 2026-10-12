// AIP-193 風のエラー。REST は 4xx/5xx の `{error: {code, message}}`、MCP は isError の tool 結果。
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 503,
    readonly code: 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNAVAILABLE',
    message: string
  ) {
    super(message)
  }
}

export const invalid = (message: string) => new ApiError(400, 'INVALID_ARGUMENT', message)

export const errorBody = (code: string, message: string) => ({ error: { code, message } })
