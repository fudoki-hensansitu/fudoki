"""Document quirk (with `skewed_frames`): a frame's header is shorter than `skewed_frames.SHORT` (132144 R8 後期 歳入 p12:
the 本年度・(前年度)・(比較) header 37pt high). Where the skewed scan reads the frame's top rule short of the frame (52–462
of a frame 50–543), the first rule found across the frame is the header's bottom rule, 37pt under the sides' top, and
`skewed_frames.top` (which opens a frame only from 40pt) leaves the header out of the frame. With this quirk the rule
drawn where the frame's sides start across most of its columns opens the frame from `HEADER` points. Read by
`skewed_frames.top`."""

SCOPE = 'document'
OPTIONS = {'const': True}
HEADER = 30  # points: the shortest header of the document (3 lines of 本年度・(前年度)・(比較) over a 千円 line)
