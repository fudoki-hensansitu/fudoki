// POST /api/chat: 会話の応答を stream で返す（守りと中身は server/api.ts・server/chat.ts）。POST 以外は 405
import { defineHandler } from 'void'
import { handleApi } from '../../server/api'

export const POST = defineHandler((c) => handleApi('/api/chat', c))
export const GET = POST
