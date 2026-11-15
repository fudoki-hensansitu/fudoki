"""Document quirk: each 款 and the total are rounded to the printed unit on their own (`※四捨五入の関係で内訳と合計が
一致しない場合があります`, 092011 決算の計数資料), so the 款 sum may miss the printed total by the rounding of the items:
less than half a unit for each 款 and for the total. The unit check takes a sum that close as matching
(`units.check`); a larger difference still stops the table."""
SCOPE = 'document'
OPTIONS = {'const': True}


def close(total: int, items_sum: int, items: int) -> bool:
    """Whether `items` amounts, each rounded to the unit, and their total rounded on its own can differ this much."""
    return 2 * abs(total - items_sum) < items + 1
