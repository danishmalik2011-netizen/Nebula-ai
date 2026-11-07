# PDF generation guidelines (Python)

Produce documents that look typeset, not exported. Always generate with a script, render to PNG, look at it, fix, repeat.

## Tool choice
- **WeasyPrint** (HTML+CSS -> PDF): best typography, easy layout, page margin boxes, running headers, page numbers, CSS grid/flex. Needs system libs (pango); if `import weasyprint` fails, use ReportLab.
- **ReportLab (platypus)**: always available via pip, precise control, tables, charts, bookmarks. Use for reports with heavy tables or when WeasyPrint is unavailable.
- **fpdf2**: small and simple for labels/invoices. **matplotlib**: charts as SVG/PNG (dpi 200) embedded in the PDF.
- Setup: `python3 -m venv .venv && pip install reportlab weasyprint pypdf pymupdf matplotlib pillow`.

## Design rules
- Page: A4 (210x297mm) or US Letter; margins 20-25mm (top/bottom 22mm); optional 12-column grid. Never fill pages edge to edge.
- Type: 1 serif or sans pair. Body 10-11pt, line height 1.4-1.5, headings 24/16/12pt with clear weight contrast, captions 8.5-9pt muted. Left-aligned (ragged right) unless the font hyphenates well. Embed fonts (TrueType): register DejaVu/Inter/Source Serif via `pdfmetrics.registerFont`, or `@font-face` in WeasyPrint; verify non-ASCII glyphs (curly quotes, en dashes, bullets, currency).
- Hierarchy: cover (title, subtitle, date, author), table of contents for >5 pages, section headings with spacing above > below, pull-out numbers (KPI row), consistent colour (one accent + neutrals, text contrast >= 4.5:1).
- Tables: header row filled with a tint, hairline row separators, right-aligned numerals, tabular figures, repeat header on page breaks, no vertical gridlines, zebra only if dense. Column widths set explicitly.
- Charts: from real data, labelled axes, direct labels instead of legends when possible, accent colour for the highlight series, grey for context, alt-text caption below.
- Furniture: running header (document title, left) and footer (page X of Y, right), thin rule, consistent. Hide on the cover.
- Images: >= 200 dpi at print size, aspect preserved, captions. Avoid widows/orphans: `keepWithNext`, `KeepTogether`, CSS `break-inside: avoid`.
- Metadata: set title, author, subject; add bookmarks/outline for sections; selectable text (never rasterise text).

## ReportLab skeleton
```python
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, KeepTogether, PageBreak, Image
INK=colors.HexColor("#1B1713"); MUTED=colors.HexColor("#6B6054"); ACCENT=colors.HexColor("#9A4424"); TINT=colors.HexColor("#F3EEE6")
body=ParagraphStyle("body",fontName="Helvetica",fontSize=10.5,leading=15.5,textColor=INK,spaceAfter=7)
h1=ParagraphStyle("h1",parent=body,fontName="Helvetica-Bold",fontSize=24,leading=28,spaceBefore=18,spaceAfter=10)
h2=ParagraphStyle("h2",parent=h1,fontSize=15,leading=19,spaceBefore=16,spaceAfter=6,textColor=ACCENT)
def furniture(c,doc):
    c.saveState(); c.setFont("Helvetica",8.5); c.setFillColor(MUTED)
    if doc.page>1:
        c.drawString(22*mm,A4[1]-14*mm,doc.title); c.drawRightString(A4[0]-22*mm,12*mm,f"Page {doc.page}")
        c.setStrokeColor(colors.HexColor("#E3DCCD")); c.line(22*mm,A4[1]-16*mm,A4[0]-22*mm,A4[1]-16*mm)
    c.restoreState()
doc=BaseDocTemplate("report.pdf",pagesize=A4,title="Quarterly report",author="Team",leftMargin=22*mm,rightMargin=22*mm,topMargin=24*mm,bottomMargin=22*mm)
doc.addPageTemplates([PageTemplate(id="p",frames=[Frame(22*mm,22*mm,A4[0]-44*mm,A4[1]-46*mm,id="f")],onPage=furniture)])
rows=[["Metric","Q1","Q2"],["Revenue","1,240","1,510"]]
t=Table(rows,colWidths=[80*mm,40*mm,40*mm],repeatRows=1)
t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),TINT),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("ALIGN",(1,0),(-1,-1),"RIGHT"),("LINEBELOW",(0,0),(-1,-1),.4,colors.HexColor("#E3DCCD")),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]))
doc.build([Paragraph("Quarterly report",h1),Paragraph("Summary text.",body),t])
```
Use `doc.multiBuild` with `TableOfContents` and an `afterFlowable` hook when a TOC is needed; call `canvas.bookmarkPage/addOutlineEntry` for the outline.

## WeasyPrint skeleton
```python
from weasyprint import HTML, CSS
css='''@page{size:A4;margin:24mm 22mm;@bottom-right{content:"Page " counter(page) " of " counter(pages);font:8.5pt Inter,sans-serif;color:#6B6054}}
@page:first{margin:0;@bottom-right{content:none}}
body{font:10.5pt/1.55 "Source Serif 4",Georgia,serif;color:#1B1713}
h1{font:700 26pt/1.15 Inter,sans-serif;break-after:avoid}h2{font:650 15pt Inter,sans-serif;color:#9A4424;break-after:avoid}
table{width:100%;border-collapse:collapse}th{background:#F3EEE6;text-align:left}td,th{padding:6pt 8pt;border-bottom:.4pt solid #E3DCCD}
figure{break-inside:avoid;margin:12pt 0}'''
HTML(string=html,base_url=".").write_pdf("report.pdf",stylesheets=[CSS(string=css)])
```

## Verify loop (mandatory)
1. Run the script; fix every exception (missing font -> register or fall back; Unicode box glyphs -> use a TTF; table too wide -> set colWidths / wrap with Paragraph cells).
2. `python -c "import pypdf;r=pypdf.PdfReader('report.pdf');print(len(r.pages),r.metadata)"` and extract text of page 1 to confirm it is real text.
3. Render pages: `python -c "import fitz;d=fitz.open('report.pdf');[p.get_pixmap(dpi=110).save(f'preview-{i+1}.png') for i,p in enumerate(d)]"` then `<view path="preview-1.png"/>` and critique: alignment, margins, orphaned headings, clipped text, low contrast, overflowing tables. Fix and rerun until clean.
4. `<deliver files="report.pdf"/>` plus the generator script if useful.
