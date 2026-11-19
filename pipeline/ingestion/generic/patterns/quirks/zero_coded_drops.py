"""Document quirk: a 項 the year drops is printed with the code 0, and so is its one 目 (狛江市の予算事項別明細書の歳入
R7: `(項) ０. 新型コロナウイルス感染症対策地方税減収補てん特別交付金 0 千円` over `０. 新型コロナ… 0 1 △1` and its
`計`). Its table opens with the 目 `0`, not `1`, and is still whole: the 款・項 titles read by `running_titles` keep
their amounts (`complete_titles`)."""
SCOPE = 'document'
OPTIONS = {'const': True}

OPENING_CODES = ('0', '1')
