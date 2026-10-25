def duplicate(box, char, placed):
    found = any(abs(box[0] - b[0]) < 1 and abs(box[1] - b[1]) < 1
                for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for b in placed[char, int(box[0]) + dx, int(box[1]) + dy])
    placed[char, int(box[0]), int(box[1])].append(box)
    return found
