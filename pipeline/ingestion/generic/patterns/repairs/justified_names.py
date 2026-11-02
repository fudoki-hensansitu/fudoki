import re

from ingestion.generic.observe import Word

CODE = re.compile(r'^[0-9０-９]{1,4}$')
HAS_DIGIT = re.compile(r'[0-9０-９,，.．]')
# The total row prints no number: its name is one of these.
TOTALS = ('歳出合計', '歳入合計', '合計', '総計')


def _same_line(a: Word, b: Word) -> bool:
    overlap = min(a.y1, b.y1) - max(a.y0, b.y0)
    return overlap >= .5 * min(a.y1 - a.y0, b.y1 - b.y0)


def join(page) -> int:
    """A name printed one character at a time across the line, justified over a column wider than the name
    (`1 報　　　　酬`: its last character stands under the amount columns), is one word.

    On a line that opens with item numbers, the single characters between the number and the first amount are
    the name; the total row (`歳 出 合 計`) opens with no number. The word starts where the name starts, so it belongs to the column the name begins in; it keeps the
    extent the name is printed over. Only declared documents read their lines so: a name of words with gaps in
    another document is not a justified one.
    """
    lines: list[list[Word]] = []
    for word in sorted(page.words, key=lambda w: ((w.y0 + w.y1) / 2, w.x0)):
        if lines and _same_line(lines[-1][0], word):
            lines[-1].append(word)
        else:
            lines.append([word])
    joined = 0
    result: list[Word] = []
    for line in lines:
        words = sorted(line, key=lambda w: w.x0)
        start = 0
        while start < len(words) and CODE.match(words[start].text):
            start += 1
        end = start
        while end < len(words) and len(words[end].text) == 1 and not HAS_DIGIT.search(words[end].text):
            end += 1
        if end - start >= 2 and (start or ''.join(w.text for w in words[start:end]) in TOTALS):
            run = words[start:end]
            result.extend(words[:start])
            result.append(Word(''.join(w.text for w in run), run[0].x0, min(w.y0 for w in run), run[-1].x1,
                               max(w.y1 for w in run)))
            result.extend(words[end:])
            joined += 1
        else:
            result.extend(words)
    page.words = result
    return joined
