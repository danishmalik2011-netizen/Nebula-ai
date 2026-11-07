# Word (docx) guidelines (Python, python-docx)

Setup: `pip install python-docx pillow matplotlib pymupdf`. For checking: `soffice --headless --convert-to pdf file.docx`, then render with PyMuPDF and `<view>` the PNGs.

## Design
- Page: A4/Letter, margins 2.2-2.5 cm. Body 11pt (Calibri/Georgia), line spacing 1.15-1.3, space after 6-8pt. Headings via real styles (`Heading 1/2/3`) so navigation and TOC work: 22/15/12pt, bold, accent colour on H2.
- Modify the built-in styles instead of direct run formatting: `doc.styles['Normal'].font.name/size`, set `rFonts` east-asia too (`style.element.rPr.rFonts.set(qn('w:eastAsia'),'Calibri')`).
- Structure: title block, optional TOC field, sections with numbered or clearly separated headings, tables with header shading and cell padding, captions, page numbers in the footer, header with document title.
- Lists: use `List Bullet` / `List Number`. Do not fake bullets with typed characters.
- Tables: `doc.add_table(rows,cols)`, style `Table Grid` then customise: header fill via `w:shd`, borders light grey, column widths set per cell, right-align numbers, `cantSplit` rows, repeat header (`w:tblHeader`).
- Images: width <= text width (15-16 cm), centred, caption beneath. Charts from matplotlib at dpi 200.
- Page numbers / TOC need field codes:
```python
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
def field(par,code):
    r=par.add_run(); a=OxmlElement('w:fldChar'); a.set(qn('w:fldCharType'),'begin')
    i=OxmlElement('w:instrText'); i.set(qn('xml:space'),'preserve'); i.text=code
    b=OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'),'end')
    r._r.append(a); r._r.append(i); r._r.append(b)
# field(footer_par,'PAGE'); field(par,'TOC \\o "1-3" \\h \\z \\u')
```
- Section breaks for landscape pages: `doc.add_section()` then set orientation and swap width/height.
- Set core properties (title, author, subject). Use hyperlinks for URLs. Keep one font family plus one accent.

## Verify loop
Run, fix errors; convert to PDF; render pages; `<view>` and check margins, heading breaks (no heading at page bottom: `keep_with_next=True`), table overflow, image sizing, fonts. Reopen with `Document(path)` to validate. Deliver `.docx` (and PDF if useful).
