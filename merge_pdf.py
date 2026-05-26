#!/usr/bin/env python3
"""Merge cover PDF + body PDF into final PDF"""
from pypdf import PdfReader, PdfWriter

A4_W, A4_H = 595.28, 841.89

def normalize_page_to_a4(page):
    box = page.mediabox
    w, h = float(box.width), float(box.height)
    if abs(w - A4_W) > 2 or abs(h - A4_H) > 2:
        from pypdf import Transformation
        sx, sy = A4_W / w, A4_H / h
        page.add_transformation(Transformation().scale(sx=sx, sy=sy))
        page.mediabox.lower_left = (0, 0)
        page.mediabox.upper_right = (A4_W, A4_H)
    return page

cover_pdf = '/home/z/my-project/download/cover.pdf'
body_pdf = '/home/z/my-project/download/guia_datos_expuestos_body.pdf'
output_pdf = '/home/z/my-project/download/guia_verificar_datos_personales_expuestos.pdf'

writer = PdfWriter()
cover_page = PdfReader(cover_pdf).pages[0]
writer.add_page(normalize_page_to_a4(cover_page))
for page in PdfReader(body_pdf).pages:
    writer.add_page(normalize_page_to_a4(page))

writer.add_metadata({
    '/Title': 'Guia para Verificar tus Datos Personales Expuestos en Internet',
    '/Author': 'Z.ai',
    '/Creator': 'Z.ai',
    '/Subject': 'Seguridad digital, OSINT, verificacion de datos personales'
})

with open(output_pdf, 'wb') as f:
    writer.write(f)

print(f'Final PDF: {output_pdf}')
