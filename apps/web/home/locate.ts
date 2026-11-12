// 現在地の市区町村。ブラウザの位置情報（ホームでうちのまちを選んでいないときに開いた時点と、「現在地から選ぶ」を押したときに求める）を国土地理院の逆ジオコーダーに渡し、市区町村コード（検査数字を除く5桁）を得る。
// 緯度・経度と IP アドレスは国土地理院に届く（プライバシーポリシーに記載）。風土記のサーバーには送らない
const REVERSE_GEOCODER = 'https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress'

export class LocateError extends Error {
  /** 位置情報がブロックされている。一度ブロックされるとサイトからは聞き直せず、ブラウザの設定で許可してもらうしかない */
  constructor(message: string, readonly denied = false) {
    super(message)
  }
}

const position = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new LocateError('このブラウザでは現在地を使えません'))
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(e.code === e.PERMISSION_DENIED ? new LocateError('位置情報の利用が許可されていません', true) : new LocateError('現在地を取得できませんでした')), { timeout: 10_000, maximumAge: 600_000 })
  })

/** 現在地の市区町村コード（5桁）。日本の外や海の上など、市区町村に当たらないときは LocateError */
export async function locateMunicipality(): Promise<string> {
  const { coords } = await position()
  const res = await fetch(`${REVERSE_GEOCODER}?lat=${coords.latitude}&lon=${coords.longitude}`).catch(() => null)
  const code = res?.ok ? ((await res.json()) as { results?: { muniCd?: string } }).results?.muniCd : undefined
  if (!code || !/^\d{5}$/.test(code)) throw new LocateError('現在地の市区町村がわかりませんでした')
  return code
}
