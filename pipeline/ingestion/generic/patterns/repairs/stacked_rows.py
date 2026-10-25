def row_neighbor(word, other):
    return other.x0 > word.x1 and any(char.isdigit() for char in other.text)
