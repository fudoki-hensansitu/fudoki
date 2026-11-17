"""Document quirk: a 項 abolished this year prints its title above the frame with no number (東久留米市の予算事項別
明細書の歳入 R8: `2款 地方譲与税` / `項 地方道路譲与税`, its 目 `地方道路譲与税 0 1 △1` with no number either).
`running_titles.title` reads a title only with its code, so the line was no title and went on with the name of the
款 title above it (`地方譲与税項地方道路譲与税`, a second 款 2). With the quirk a title line that opens with the bare
mark (`項` or `款`, then the name) is a title with no code. The name may be in brackets (文京区 R6 当初の歳入:
`項 (広域連合補助金)`), but not a bracketed number or mark (`項(1)`, `款(項)`).

A table title above the frame that names a 款 the year drops prints `第` and `款` with no number between them (稲城市の
国民健康保険事業特別会計予算書 R7 の歳入: `第　款 財産収入 （予算額 0 千円）`, its 項・目 with no number either).
`Layout.Logical.titles` reads such a line as the 款 title with no code, or its rows go on under the 款 before it."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

BARE = re.compile(r'^(款|項)([^\d.．(（].*|[(（][^\d款項].*)$')
KAN = re.compile(r'^第款([^(（0-9]+)')


def title(value: str) -> tuple[str, None, str] | None:
    match = BARE.match(value)
    return (match.group(1), None, match.group(2)) if match else None


def kan_title(value: str) -> str | None:
    match = KAN.match(value)
    return match.group(1) if match else None
