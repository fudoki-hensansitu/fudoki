import re


def normalize(self, token):
    """Restore printed glyphs mangled by this PDF's font encoding."""
    return self.GLYPH_FIX.get(token, token)


def repair_text(self, value, context=None):
    """Repair text-layer misencodings; returns the printed reading."""
    result = value
    for wrong, right in self.REPAIR_WORDS:
        if wrong in result:
            self.REPAIR_HITS[wrong + '→' + right] = self.REPAIR_HITS.get(wrong + '→' + right, 0) + result.count(wrong)
            result = result.replace(wrong, right)
    for wrong, right in self.REPAIR_CHARS.items():
        if wrong in result:
            self.REPAIR_HITS[wrong + '→' + right] = self.REPAIR_HITS.get(wrong + '→' + right, 0) + result.count(wrong)
            result = result.replace(wrong, right)
    for pattern, replacement, label in self.REPAIR_PATTERNS:
        fixed = re.sub(pattern, replacement, result)
        if fixed != result:
            self.REPAIR_HITS[label] = self.REPAIR_HITS.get(label, 0) + 1
            result = fixed
    if len(result) > 1 and '•' in result:
        result = result.replace('•', '・')
    # · (U+00B7) is the text-layer rendering of the printed fullwidth ・
    if '·' in result:
        self.REPAIR_HITS['·→・'] = self.REPAIR_HITS.get('·→・', 0) + result.count('·')
        result = result.replace('·', '・')
    return result


def repair_brackets(self, value, dept_parens=True):
    """Affiliation brackets 【課名】 misencode as ［］, （）, 課l, 課）, or drop
    the closer; normalize them when the contents end in a department suffix.
    dept_parens=False leaves parenthesized facility qualifiers ((本所),
    （私立幼稚園）, …) alone — only 事業-level names carry 【所管】."""
    value = value.replace('［', '【').replace('］', '】')
    # A second 【 before any 】 is a doubled opener (【地坑［子育て支援課］).
    value = re.sub(r'【([^【】]*)【', r'【\1', value)
    # 課 misread inside brackets (誤】, 課1, 課l).
    value = value.replace('誤】', '課】')
    value = re.sub(r'【([^【】（）］]{1,40}?' + self.DEPT_SUFFIX.pattern + r')[l1］）\)、】]',
                   r'【\1】', value)
    value = re.sub(r'【([^【】（）］]{1,40}?' + self.DEPT_SUFFIX.pattern + r')$',
                   r'【\1】', value)
    if dept_parens:
        value = re.sub(r'（([^（）【】］]{1,40}?' + self.DEPT_SUFFIX.pattern + r')[l1］）\)、】]',
                       r'【\1】', value)
        value = re.sub(r'（([^（）【】］]{1,40}?' + self.DEPT_SUFFIX.pattern + r')$',
                       r'【\1】', value)
    # Printed dept-list separators are '、' (misencoded ， or ．) and are
    # sometimes dropped entirely between two department names.
    value = re.sub(r'(?<=課)，|(?<=局)，|(?<=所)，', '、', value)
    value = re.sub(r'(?<=課)．|(?<=局)．|(?<=所)．', '、', value)
    # The text layer drops the '、' separator between two department names in
    # exactly the observed cases; keep this scoped so single names like
    # 課税課 (課…課) are never split.
    for wrong, right in self.BRACKET_WORDS:
        value = value.replace(wrong, right)
    value = value.replace('課l', '課】')
    value = value.replace('課1', '課】')
    return value


def repair_width(self, value):
    """Parenthesized groups print with fullwidth brackets and digits/letters;
    the text layer emits halfwidth variants. Normalize them."""
    def widen(match):
        inner = match[1]
        if match[0][0] == '(' or match[0][-1] == ')':
            self.REPAIR_HITS['()→（）'] = self.REPAIR_HITS.get('()→（）', 0) + 1
        widened = inner.translate(self.FULLWIDTH)
        if widened != inner:
            self.REPAIR_HITS['半角→全角'] = self.REPAIR_HITS.get('半角→全角', 0) + 1
        return '（' + widened + '）'

    return re.sub(r'[（(]([^（）()]{0,30}?)[）)]', widen, value)


def repair_name(self, value, dept_parens=True):
    """Full name-string repair: token-level rules, bracket normalization,
    then fullwidth restoration inside parenthesized groups."""
    return self.rule('repair_width')(self.rule('repair_brackets')(self.rule('repair_text')(value), dept_parens)) if value else value

FUNCTIONS = {
    'normalize': normalize,
    'repair_brackets': repair_brackets,
    'repair_name': repair_name,
    'repair_text': repair_text,
    'repair_width': repair_width,
}
