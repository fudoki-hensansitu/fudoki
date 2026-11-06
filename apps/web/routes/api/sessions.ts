// POST /api/sessions: Turnstile を確かめて会話の token を出す（守りと中身は server/api.ts）。POST 以外は 405
import { defineHandler } from 'void'
import { handleApi } from '../../server/api'

export const POST = defineHandler((c) => handleApi('/api/sessions', c))
export const GET = POST
