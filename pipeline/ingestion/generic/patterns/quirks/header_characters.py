"""Document quirk: OCR cuts a header printed again inside the body into other words than the header above it
(`header_characters`, 133035 当初予算: `本年度` `前年度` over the first table, `本` `年度` … `本年度前` over the second
table of the page). A row repeats the header when its words are made of the header's characters, not when they are
the header's words (`layout.repeated_header`)."""

SCOPE = 'document'
OPTIONS = {'const': True}


def matches(word: str, header: set[str]) -> bool:
    """Whether every character of a word of the row is a character of the header."""
    characters = set(''.join(header))
    return bool(word) and set(word) <= characters
