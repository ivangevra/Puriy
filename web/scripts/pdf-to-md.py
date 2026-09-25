"""Convierte un PDF a Markdown/texto para consultarlo sin abrir el PDF.

Requiere PyMuPDF:  .venv\Scripts\python.exe -m pip install pymupdf4llm
Uso:  python web/scripts/pdf-to-md.py archivo.pdf docs/fuentes/archivo.md [--rapido]

--rapido extrae solo texto por página (útil para PDF grandes como el PDU);
sin él usa pymupdf4llm, que conserva títulos y tablas en Markdown.
Cada página queda marcada con <!-- pN --> para citar el número de página.
"""
import sys

import pymupdf

src, out = sys.argv[1], sys.argv[2]
doc = pymupdf.open(src)
if '--rapido' in sys.argv:
    text = ''.join(f'\n\n<!-- p{i + 1} -->\n{page.get_text()}' for i, page in enumerate(doc))
else:
    import pymupdf4llm

    chunks = pymupdf4llm.to_markdown(doc, page_chunks=True, ignore_images=True)
    text = ''.join(f"\n\n<!-- p{c['metadata']['page']} -->\n{c['text']}" for c in chunks)
open(out, 'w', encoding='utf-8').write(text)
print(f'{doc.page_count} páginas -> {out} ({len(text)} caracteres)')
