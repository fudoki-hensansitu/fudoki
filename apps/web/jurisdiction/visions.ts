// 自治体の頁の見出しとホームに出す都市像（基本構想が掲げるまちの将来像）。API に無いので、基本構想から手で起こした文をここに置く
export interface Vision {
  text: string
  /** 基本構想の PDF */
  source: string
}

export const VISIONS: Record<string, Vision> = {
  // 品川区
  '131091': { text: '輝く笑顔 住み続けたいまち しながわ', source: 'https://www.city.shinagawa.tokyo.jp/_res/projects/default_project/_page_/001/004/987/kihonkoso0327.pdf' },
}
