/** 自治体ごとの資産（public/jurisdictions/<code>/ の紋章・OG 画像など）の URL。画面の bundle から紋章の表（emblems.ts）を引き込まないよう分けてある */
export const assetPath = (code: string, file: string) => `/jurisdictions/${code}/${file}`
