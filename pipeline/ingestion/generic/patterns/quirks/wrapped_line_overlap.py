"""Axis quirk: OCR boxes the lines of a wrapped name a little taller than they print, so a wrapped line begins inside the
line above it (港区 R7 当初予算の説明: `(3)子育て支援サービスの充実（子ども政策課、保育課、` ending at 498.1 and
`子ども家庭支援センター）  (1,321,560)` beginning at 496.0). The value is how far into the line above (a fraction of the
line's height) a line may begin and still go on with the name above it under `wrap: amount_on_last_line`."""
SCOPE = 'axis'
OPTIONS = {'type': 'number', 'exclusiveMinimum': 0, 'maximum': 0.5}
