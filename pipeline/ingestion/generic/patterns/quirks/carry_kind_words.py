"""Document quirk: the 翌年度繰越額 column prints one amount a row and tags a carried-over amount with a short word of its
kind before it (`明許 20,942,000`, `事故 58,846,671`); a row that carries over in two kinds stacks the two tagged lines
in its cell (文京区の決算書 R5 p151 `8 土木費`). Without the quirk both amounts take the column's heading and conflict.
With it a tagged amount takes the kind's heading under the column's group (`翌年度繰越額／繰越明許費`); an untagged one
keeps the column's."""
SCOPE = 'document'
OPTIONS = {'const': True}

KINDS = {'明許': '繰越明許費', '繰越明許': '繰越明許費', '繰越明許費': '繰越明許費',
         '事故': '事故繰越し', '事故繰越': '事故繰越し', '事故繰越し': '事故繰越し',
         '逓次': '継続費逓次繰越', '逓次繰越': '継続費逓次繰越', '継続費逓次繰越': '継続費逓次繰越'}


def kind(word: str) -> str | None:
    """The heading of the carry-over kind a tag word names, or None."""
    return KINDS.get(word)
