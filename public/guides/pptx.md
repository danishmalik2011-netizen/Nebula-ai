# PowerPoint (pptx) guidelines (Python, python-pptx)

Setup: `python3 -m venv .venv && pip install python-pptx pillow matplotlib pymupdf`. Check `which soffice libreoffice` to render slides for review.

## Design rules
- 16:9, 13.333 x 7.5 in (`prs.slide_width=Inches(13.333)`). Margins 0.6 in. Use a 12-column grid; align everything to it.
- One idea per slide. Title = the takeaway sentence (<= 12 words). Body <= 30 words or 4 bullets; prefer a visual (chart, diagram, big number, image) over bullets.
- Type: two fonts max (safe: Calibri/Arial or Georgia + Arial). Title 32-40pt, body 18-24pt, captions >= 12pt. Never below 14pt for content. Strong weight contrast, left-aligned.
- Colour: dark ink text on light background (or inverse for section slides); one accent, neutrals, contrast >= 4.5:1. Define a palette dict and use it everywhere.
- Slide types: title, agenda, section divider (big number + title), content+visual, big-number KPI row, comparison (2 columns), timeline/process, quote, data chart, closing/next steps. Repeat patterns for consistency.
- Visuals: native charts (editable) via `chart_data`; diagrams from shapes with consistent corner radius; images cropped to a grid, never stretched; icons as simple shapes or inline images; no clip-art, no WordArt, no shadow overload.
- Speaker notes on every content slide (`slide.notes_slide.notes_text_frame.text`). Add slide numbers and a small footer except on title/section slides.

## Builder helpers (write once, reuse)
```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
INK=RGBColor(0x1B,0x17,0x13); MUTED=RGBColor(0x6B,0x60,0x54); ACCENT=RGBColor(0x9A,0x44,0x24); BG=RGBColor(0xFA,0xF7,0xF1); TINT=RGBColor(0xF0,0xE9,0xDD)
prs=Presentation(); prs.slide_width=Inches(13.333); prs.slide_height=Inches(7.5)
blank=prs.slide_layouts[6]
def bg(slide,color=BG):
    f=slide.background.fill; f.solid(); f.fore_color.rgb=color
def text(slide,s,x,y,w,h,size=20,bold=False,color=INK,align=PP_ALIGN.LEFT,font="Calibri",anchor=MSO_ANCHOR.TOP):
    tb=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h)); tf=tb.text_frame; tf.word_wrap=True; tf.vertical_anchor=anchor
    tf.margin_left=tf.margin_right=Inches(0.02)
    p=tf.paragraphs[0]; p.alignment=align; r=p.add_run(); r.text=s; r.font.size=Pt(size); r.font.bold=bold; r.font.color.rgb=color; r.font.name=font
    return tb
def title_slide(t,sub):
    s=prs.slides.add_slide(blank); bg(s,INK); text(s,t,0.9,2.4,11.5,1.6,48,True,BG,font="Georgia"); text(s,sub,0.9,4.2,11,0.8,22,False,TINT); return s
def bullets(slide,items,x=0.9,y=1.9,w=11.5,size=22,gap=10):
    tb=slide.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(4.8)); tf=tb.text_frame; tf.word_wrap=True
    for i,it in enumerate(items):
        p=tf.paragraphs[0] if i==0 else tf.add_paragraph(); p.space_after=Pt(gap); r=p.add_run(); r.text="\u2022  "+it; r.font.size=Pt(size); r.font.color.rgb=INK; r.font.name="Calibri"
def chart(slide,cats,vals,x,y,w,h,kind=XL_CHART_TYPE.COLUMN_CLUSTERED):
    cd=CategoryChartData(); cd.categories=cats; cd.add_series("Series",vals)
    g=slide.shapes.add_chart(kind,Inches(x),Inches(y),Inches(w),Inches(h),cd).chart; g.has_legend=False
    g.plots[0].series[0].format.fill.solid(); g.plots[0].series[0].format.fill.fore_color.rgb=ACCENT
    g.value_axis.has_major_gridlines=True; g.value_axis.major_gridlines.format.line.color.rgb=TINT
    g.category_axis.tick_labels.font.size=Pt(14); g.value_axis.tick_labels.font.size=Pt(14); return g
```

## Overflow control (python-pptx does not auto-fit)
Estimate text size before placing: roughly `chars_per_line = width_in * 72 / (size_pt*0.5)`. If a text box would exceed its height, reduce words, split the slide, or lower size (never below 14pt). Re-render to confirm.

## Verify loop (mandatory)
1. Run the script, fix exceptions. 2. `soffice --headless --convert-to pdf deck.pptx` (wait for it), then render pages with PyMuPDF to `slide-N.png` (dpi 80). 3. `<view>` each key slide: check overflow, overlaps, alignment, contrast, empty areas, consistent margins, image quality. 4. Fix and rebuild until every slide looks intentional. 5. Reopen with `Presentation('deck.pptx')` to confirm it loads. 6. `<deliver files="deck.pptx"/>` (and the PDF export if requested).
If LibreOffice is missing, still self-review by computing shape bounds (no shape beyond slide width/height, no overlaps) and keep layouts conservative.
