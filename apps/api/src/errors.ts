// AIP-193 風のエラー。REST は 4xx/5xx の `{error: {code, message}}`、MCP は isError の tool 結果。
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 404 | 413 | 415 | 429 | 503,
    readonly code: 'INVALID_ARGUMENT' | 'NOT_FOUND' | 'UNAVAILABLE' | 'PAYLOAD_TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'RESOURCE_EXHAUSTED',
    message: string,
    /** 429 のとき、再試行までの秒数。REST は Retry-After、MCP は本文に書く。 */
    readonly retryAfter?: number
  ) {
    super(message)
  }
}

export const invalid = (message: string) => new ApiError(400, 'INVALID_ARGUMENT', message)

export const errorBody = (code: string, message: string, retryAfter?: number) => ({
  error: { code, message, ...(retryAfter === undefined ? {} : { retry_after_seconds: retryAfter }) },
})
