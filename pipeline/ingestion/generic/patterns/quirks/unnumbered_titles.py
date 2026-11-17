"""Document quirk: a 項 abolished this year prints its title above the frame with no number (東久留米市の予算事項別
明細書の歳入 R8: `2款 地方譲与税` / `項 地方道路譲与税`, its 目 `地方道路譲与税 0 1 △1` with no number either).
`running_titles.title` reads a title only with its code, so the line was no title and went on with the name of the
款 title above it (`地方譲与税項地方道路譲与税`, a second 款 2). With the quirk a title line that opens with the bare
mark (`項` or `款`, then the name) is a title with no code."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

BARE = re.compile(r'^(款|項)([^\d.．(（].*)$')


def title(value: str) -> tuple[str, None, str] | None:
    match = BARE.match(value)
    return (match.group(1), None, match.group(2)) if match else None
