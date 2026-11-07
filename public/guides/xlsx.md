# Excel (xlsx) guidelines (Python, openpyxl)

Setup: `pip install openpyxl pandas xlsxwriter`. Use openpyxl to edit existing files, xlsxwriter or openpyxl to create new ones. Recalculate/check with `soffice --headless --convert-to pdf` or by reading with pandas.

## Rules
- Live formulas, not pasted numbers: totals, ratios, lookups are `=SUM(B2:B20)`, `=B2/C2`, `=XLOOKUP(...)` (use `INDEX/MATCH` for older Excel). Never hard-code results; keep assumptions in labelled input cells, referenced by formulas (named ranges via `wb.defined_names`).
- One sheet per purpose: `Summary` (first, with key numbers and a chart), `Data`, `Inputs/Assumptions`, `Lists`. Name sheets clearly.
- Format as a product: header row bold with fill, freeze panes (`ws.freeze_panes="A2"`), autofilter, column widths set from content (max len + 2), number formats (`#,##0`, `0.0%`, `$#,##0.00`, dates `yyyy-mm-dd`), alignment (numbers right, text left), light borders, consistent font (Calibri 11), print setup (fit to width, landscape, titles).
- Colour with meaning: inputs blue text, formulas black, links green, warnings red; conditional formatting for thresholds (`ColorScaleRule`, `CellIsRule`, data bars). Avoid rainbow fills.
- Data validation for inputs (lists, ranges), protect formula cells if requested, add a short `README` sheet or cell notes.
- Charts: `openpyxl.chart` (BarChart, LineChart, PieChart) with titles, axis titles, sensible size (anchor beside data), accent colour; keep to 1-2 per sheet.
- Tables: `ws.add_table(Table(ref="A1:F100",displayName="Sales"))` with a style (`TableStyleMedium2`).

## Template
```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
wb=Workbook(); ws=wb.active; ws.title="Data"
ws.append(["Month","Revenue","Cost","Margin"])
for i,(m,r,c) in enumerate([("Jan",1200,800),("Feb",1500,900)],start=2): ws.append([m,r,c,f"=(B{i}-C{i})/B{i}"])
for c in ws[1]: c.font=Font(bold=True,color="FFFFFF"); c.fill=PatternFill("solid",fgColor="9A4424"); c.alignment=Alignment(horizontal="center")
for row in ws.iter_rows(min_row=2): row[1].number_format=row[2].number_format="#,##0"; row[3].number_format="0.0%"
for i,col in enumerate(ws.columns,1): ws.column_dimensions[get_column_letter(i)].width=max(len(str(c.value or "")) for c in col)+4
ws.freeze_panes="A2"; ws.auto_filter.ref=ws.dimensions
wb.save("model.xlsx")
```

## Verify
Open with `load_workbook(path,data_only=False)` to confirm formulas exist; compute a copy with LibreOffice (`soffice --headless --convert-to xlsx --outdir out model.xlsx`) and read values with `data_only=True` to ensure no `#REF!`, `#DIV/0!`, `#NAME?`. Render a PDF/PNG preview and `<view>` the summary sheet. Deliver the xlsx.
