"""Document quirk: the header of each table is one ruled row, ended by the first rule across the frame below its top
(武蔵野市の予算説明書: `目 | 本年度予算額 | … | 節 区分 金額 節の説明 | 説明` with the `千円` line inside the row).

`layout._header_bottom` ends a header at the last full rule above the frame's first figure. 武蔵野市 prints its spread
as two frames, and where a 項 closes at the top of a spread with its `計` row only and the next 項 opens below under its
titles and its header again (2026年度 p101), the right frame prints no figure until the second table's body: the
header ran down to the second header's bottom and both were read as one (`節／区分／節／区分`). With this quirk the
first full rule below the top ends the header; the header printed again below is a repeated header row
(`layout.repeated_header`)."""

SCOPE = 'document'
OPTIONS = {'const': True}
