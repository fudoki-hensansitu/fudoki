"""Document quirk: a subject the year drops prints a small `廃目` (or `廃項`・`廃款`) where its code would stand, and
its name after it (092096 R8 当初 歳入: `廃目 総務債 0 761,400 △761,400`). The mark names the level, wherever the line
starts (the mark is set left of the 目's codes, near the 項's), and is no part of the name. Read by the subject
pattern `indent`."""
import re

SCOPE = 'document'
OPTIONS = {'const': True}

MARK = re.compile(r'^廃([款項目])\s*(\S.*)$')


def split(name: str) -> tuple[str, str] | None:
    """The level the mark names and the name after it, or None for a name without the mark."""
    found = MARK.match(name)
    return (found.group(1), found.group(2)) if found else None
