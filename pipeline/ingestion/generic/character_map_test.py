"""A declared font map must preserve money and its printed location."""
from pathlib import Path
import tempfile
import unittest

from ingestion.generic.observe import observe
from ingestion.generic.repair import repair


def font_pdf(path: Path):
    # Visible Helvetica digits with a wrong ToUnicode map, as in municipal
    # PDFs whose glyph IDs were exported as Unicode control codes.
    cmap = b'''/CIDInit /ProcSet findresource begin 12 dict begin begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Broken def /CMapType 2 def
1 begincodespacerange <00> <FF> endcodespacerange
11 beginbfchar
<30> <0013> <31> <0014> <32> <0015> <33> <0016> <34> <0017>
<35> <0018> <36> <0019> <37> <001A> <38> <001B> <39> <001C> <2C> <000F>
endbfchar
endcmap CMapName currentdict /CMap defineresource pop end end'''
    content = b'BT /F1 12 Tf 20 60 Td (1,234,567,890) Tj ET'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
               b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>',
               b'<< /Length %d >>\nstream\n' % len(content) + content + b'\nendstream',
               b'<< /Length %d >>\nstream\n' % len(cmap) + cmap + b'\nendstream']
    data = b'%PDF-1.4\n'
    offsets = []
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data += f'{number} 0 obj\n'.encode() + obj + b'\nendobj\n'
    xref = len(data)
    data += b'xref\n0 7\n0000000000 65535 f \n'
    data += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)
    data += f'trailer << /Size 7 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    path.write_bytes(data)


class CharacterMapTest(unittest.TestCase):
    def test_mapping_preserves_money_and_location_and_invalidates_observation_cache(self):
        mapping = {**{chr(19 + digit): str(digit) for digit in range(10)}, '\x0f': ','}
        with tempfile.TemporaryDirectory() as directory:
            pdf, cache = Path(directory) / 'font.pdf', Path(directory) / 'words.json'
            font_pdf(pdf)
            self.assertEqual(observe(pdf, [1], cache)[0].words, [])
            pages = observe(pdf, [1], cache, mapping)
            self.assertEqual([w.text for w in pages[0].words], ['1,234,567,890'])
            box = pages[0].words[0]
            self.assertAlmostEqual(box.x0, 20)
            self.assertGreater(box.x1, box.x0)
            repaired, report = repair(pdf, pages, character_map=mapping)
            self.assertEqual([w.text for w in repaired[0].words], ['1,234,567,890'])
            self.assertIsNone(report.invisible_error)
            self.assertEqual(observe(pdf, [1], cache)[0].words, [])
