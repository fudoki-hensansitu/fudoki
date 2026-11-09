// 文を単語に分ける。標準入力の JSON（文字列の配列）を読み、単語（句読点・記号を除く）の配列の配列を返す。
// 施策と予算書の内訳の名前の重なりを測るために link_initiatives.py から呼ぶ（Python に同じ分かち書きが無いため）。
const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
const texts: string[] = JSON.parse(await Bun.stdin.text())
console.log(JSON.stringify(texts.map((text) => [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment))))

export {}
