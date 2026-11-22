/** class 名を空白で繋ぐ（偽の値は落とす） */
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ')
