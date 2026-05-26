#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera la guía PDF: Cómo Verificar tus Datos Personales Expuestos en Internet"""

import os, sys, hashlib
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, PageBreak, Image,
    KeepTogether, CondPageBreak
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily

# ── Font Registration ──
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif-Bold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Carlito', '/usr/share/fonts/truetype/english/Carlito-Regular.ttf'))
pdfmetrics.registerFont(TTFont('Carlito-Bold', '/usr/share/fonts/truetype/english/Carlito-Bold.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansReg', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSansBold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))

registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif-Bold')
registerFontFamily('Carlito', normal='Carlito', bold='Carlito-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ── Palette ──
ACCENT       = colors.HexColor('#24738e')
TEXT_PRIMARY  = colors.HexColor('#222426')
TEXT_MUTED    = colors.HexColor('#848a8f')
BG_SURFACE   = colors.HexColor('#dfe3e7')
BG_PAGE      = colors.HexColor('#eaebed')

TABLE_HEADER_COLOR = ACCENT
TABLE_HEADER_TEXT  = colors.white
TABLE_ROW_EVEN     = colors.white
TABLE_ROW_ODD      = BG_SURFACE

# ── Page Setup ──
PAGE_W, PAGE_H = A4
LEFT_MARGIN   = 1.0 * inch
RIGHT_MARGIN  = 1.0 * inch
TOP_MARGIN    = 0.8 * inch
BOTTOM_MARGIN = 0.8 * inch
CONTENT_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN

# ── Styles ──
styles = getSampleStyleSheet()

style_h1 = ParagraphStyle(
    'H1Custom', fontName='LiberationSerif', fontSize=20, leading=28,
    spaceBefore=18, spaceAfter=10, textColor=ACCENT, alignment=TA_LEFT
)
style_h2 = ParagraphStyle(
    'H2Custom', fontName='LiberationSerif', fontSize=15, leading=22,
    spaceBefore=14, spaceAfter=8, textColor=ACCENT, alignment=TA_LEFT
)
style_h3 = ParagraphStyle(
    'H3Custom', fontName='LiberationSerif', fontSize=12.5, leading=18,
    spaceBefore=10, spaceAfter=6, textColor=TEXT_PRIMARY, alignment=TA_LEFT
)
style_body = ParagraphStyle(
    'BodyCustom', fontName='LiberationSerif', fontSize=10.5, leading=17,
    spaceBefore=0, spaceAfter=6, textColor=TEXT_PRIMARY, alignment=TA_JUSTIFY,
    firstLineIndent=0
)
style_body_indent = ParagraphStyle(
    'BodyIndent', parent=style_body, leftIndent=18, firstLineIndent=0
)
style_bullet = ParagraphStyle(
    'BulletCustom', parent=style_body, leftIndent=24, firstLineIndent=0,
    bulletIndent=12, spaceBefore=2, spaceAfter=2
)
style_note = ParagraphStyle(
    'NoteCustom', parent=style_body, fontSize=9.5, leading=14,
    textColor=TEXT_MUTED, leftIndent=12, fontName='DejaVuSans'
)
style_table_header = ParagraphStyle(
    'TableHeader', fontName='LiberationSerif', fontSize=10,
    textColor=colors.white, alignment=TA_CENTER, leading=14
)
style_table_cell = ParagraphStyle(
    'TableCell', fontName='LiberationSerif', fontSize=9.5,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, leading=13
)
style_table_cell_c = ParagraphStyle(
    'TableCellCenter', parent=style_table_cell, alignment=TA_CENTER
)
style_callout = ParagraphStyle(
    'Callout', fontName='LiberationSerif', fontSize=11, leading=17,
    textColor=ACCENT, leftIndent=24, borderPadding=6,
    spaceBefore=6, spaceAfter=6, alignment=TA_LEFT
)
style_caption = ParagraphStyle(
    'Caption', fontName='LiberationSerif', fontSize=9, leading=12,
    textColor=TEXT_MUTED, alignment=TA_CENTER, spaceBefore=3, spaceAfter=6
)

# ── TOC DocTemplate ──
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ── Helper Functions ──
def add_heading(text, style, level=0):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), style)
    p.bookmark_name = text
    p.bookmark_level = level
    p.bookmark_text = text
    p.bookmark_key = key
    return p

MAX_KEEP_HEIGHT = PAGE_H * 0.4

def safe_keep_together(elements):
    total_h = 0
    for el in elements:
        w, h = el.wrap(CONTENT_W, PAGE_H)
        total_h += h
    if total_h <= MAX_KEEP_HEIGHT:
        return [KeepTogether(elements)]
    elif len(elements) >= 2:
        return [KeepTogether(elements[:2])] + list(elements[2:])
    else:
        return list(elements)

def make_table(data, col_ratios, caption_text=None):
    col_widths = [r * CONTENT_W for r in col_ratios]
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_COLOR),
        ('TEXTCOLOR', (0, 0), (-1, 0), TABLE_HEADER_TEXT),
        ('GRID', (0, 0), (-1, -1), 0.5, TEXT_MUTED),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(1, len(data)):
        bg = TABLE_ROW_EVEN if i % 2 == 1 else TABLE_ROW_ODD
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(style_cmds))
    elements = [Spacer(1, 18), t]
    if caption_text:
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(caption_text, style_caption))
    elements.append(Spacer(1, 18))
    return elements

# ── Build Story ──
story = []

# TOC
toc = TableOfContents()
toc.levelStyles = [
    ParagraphStyle('TOC1', fontName='LiberationSerif', fontSize=12, leading=20, leftIndent=20, spaceBefore=4),
    ParagraphStyle('TOC2', fontName='LiberationSerif', fontSize=10.5, leading=18, leftIndent=40, spaceBefore=2),
]
story.append(Paragraph('<b>Tabla de Contenidos</b>', ParagraphStyle(
    'TOCTitle', fontName='LiberationSerif', fontSize=18, leading=24,
    textColor=ACCENT, alignment=TA_LEFT, spaceAfter=12
)))
story.append(toc)
story.append(PageBreak())

# ═══════════════════════════════════════════
# SECTION 1: Introduccion
# ═══════════════════════════════════════════
story.append(add_heading('<b>1. Introduccion: Por que Importa tu Huella Digital</b>', style_h1, 0))

story.append(Paragraph(
    'Vivimos en una era donde cada accion en linea deja un rastro: desde crear una cuenta en una red social hasta '
    'realizar una compra en un comercio electronico, cada interaccion genera datos que se almacenan en servidores '
    'alrededor del mundo. La huella digital que dejamos puede incluir nombres, direcciones de correo electronico, '
    'numeros de telefono, direcciones fisicas, contrasenas, numeros de documentos de identidad e incluso datos '
    'biometricos. Estos datos, una vez expuestos, pueden ser utilizados por actores maliciosos para suplantacion '
    'de identidad, fraude financiero, acoso digital o ataques de ingenieria social.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'El concepto de "datos expuestos" abarca dos dimensiones fundamentales: los datos que voluntariamente '
    'compartimos en redes sociales y plataformas publicas, y los datos que se filtran involuntariamente a traves '
    'de brechas de seguridad (data breaches). Segun informes de la industria, mas de 22 mil millones de registros '
    'fueron expuestos en filtraciones de datos durante los ultimos anos, afectando a usuarios de plataformas tan '
    'diversas como redes sociales, servicios de correo electronico, instituciones financieras y plataformas de '
    'ecommerce. Esta guia te proporcionara las herramientas y tecnicas necesarias para descubrir que informacion '
    'tuya esta disponible en internet y que medidas puedes tomar para protegerla.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Es importante entender que verificar tus datos expuestos no es una actividad ilegal ni invasiva. Se trata '
    'de utilizar fuentes abiertas (OSINT - Open Source Intelligence) para auditar tu propia huella digital, '
    'exactamente la misma informacion que cualquier persona con conocimientos basicos podria encontrar sobre ti. '
    'Conocer lo que esta expuesto es el primer paso para tomar el control de tu privacidad digital y reducir '
    'los riesgos asociados a la exposicion no deseada de informacion personal.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 2: Que son los datos personales expuestos
# ═══════════════════════════════════════════
story.append(add_heading('<b>2. Que son los Datos Personales Expuestos</b>', style_h1, 0))

story.append(add_heading('<b>2.1 Tipos de Datos que Pueden Estar Expuestos</b>', style_h2, 1))
story.append(Paragraph(
    'Los datos personales que pueden encontrarse expuestos en internet se clasifican en varias categorias, '
    'dependiendo de su naturaleza y del nivel de sensibilidad. Comprender esta clasificacion es esencial para '
    'evaluar el riesgo real que representa cada tipo de exposicion y priorizar las acciones de mitigacion. '
    'A continuacion se presenta una tabla con los principales tipos de datos y el nivel de riesgo asociado.',
    style_body
))

tbl1_data = [
    [Paragraph('<b>Tipo de Dato</b>', style_table_header),
     Paragraph('<b>Ejemplos</b>', style_table_header),
     Paragraph('<b>Nivel de Riesgo</b>', style_table_header)],
    [Paragraph('Datos de identidad', style_table_cell),
     Paragraph('Nombre completo, fecha de nacimiento, numero de documento', style_table_cell),
     Paragraph('Alto', style_table_cell_c)],
    [Paragraph('Datos de contacto', style_table_cell),
     Paragraph('Correo electronico, telefono, direccion fisica', style_table_cell),
     Paragraph('Medio-Alto', style_table_cell_c)],
    [Paragraph('Credenciales', style_table_cell),
     Paragraph('Contrasenas, preguntas de seguridad, tokens de acceso', style_table_cell),
     Paragraph('Critico', style_table_cell_c)],
    [Paragraph('Datos financieros', style_table_cell),
     Paragraph('Numero de tarjeta, cuenta bancaria, historial crediticio', style_table_cell),
     Paragraph('Critico', style_table_cell_c)],
    [Paragraph('Datos de actividad', style_table_cell),
     Paragraph('Historial de navegacion, compras en linea, ubicaciones', style_table_cell),
     Paragraph('Medio', style_table_cell_c)],
    [Paragraph('Datos biometricos', style_table_cell),
     Paragraph('Fotos faciales, huellas dactilares, reconocimiento de voz', style_table_cell),
     Paragraph('Alto', style_table_cell_c)],
    [Paragraph('Metadatos', style_table_cell),
     Paragraph('Datos EXIF de fotos, informacion de dispositivo, IP', style_table_cell),
     Paragraph('Medio', style_table_cell_c)],
]
story.extend(make_table(tbl1_data, [0.20, 0.52, 0.18], 'Tabla 1: Clasificacion de datos personales por tipo y nivel de riesgo'))

story.append(add_heading('<b>2.2 Como se Exponen tus Datos</b>', style_h2, 1))
story.append(Paragraph(
    'Los datos personales se exponen a traves de multiples vias, muchas de las cuales pasan desapercibidas para '
    'el usuario promedio. Las filtraciones masivas de datos (data breaches) son la fuente mas visible de exposicion: '
    'cuando una empresa sufre un ataque cibernetico exitoso, millones de registros de usuarios pueden quedar '
    'expuestos en foros de la dark web o en sitios de distribucion de datos filtrados. Plataformas como LinkedIn, '
    'Yahoo, Facebook, Marriott y miles de otras empresas han sufrido brechas que afectaron a cientos de millones '
    'de usuarios en los ultimos anos.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Sin embargo, las brechas de seguridad no son la unica fuente de exposicion. El sobrecifrado de datos '
    '(oversharing) en redes sociales es una causa significativa: muchos usuarios comparten voluntariamente '
    'informacion sensible como su ubicacion en tiempo real, fotos con metadatos EXIF que revelan coordenadas '
    'exactas, fechas de nacimiento, nombres de familiares y datos laborales. Ademas, las practicas de '
    'recopilacion de datos por parte de brokers de informacion (data brokers) contribuyen a que tus datos '
    'esten disponibles en bases de datos publicas y directorios en linea sin tu conocimiento explicito.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Otra fuente comun de exposicion es el uso de servicios en linea que venden o comparten datos de usuarios '
    'con terceros, asi como las aplicaciones moviles que solicitan permisos excesivos y recopilan informacion '
    'mas alla de lo necesario para su funcionamiento. Los sitios web que no implementan adecuadamente las '
    'practicas de seguridad tambien pueden exponer datos a traves de vulnerabilidades como inyecciones SQL, '
    'acceso no autorizado a APIs o configuraciones incorrectas de servidores que dejan directorios sensibles '
    'accesibles al publico.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 3: Herramientas OSINT esenciales
# ═══════════════════════════════════════════
story.append(add_heading('<b>3. Herramientas OSINT Esenciales para Verificar tu Exposicion</b>', style_h1, 0))

story.append(Paragraph(
    'Las herramientas de inteligencia de fuentes abiertas (OSINT) son el punto de partida para cualquier '
    'auditoria de huella digital. Estas herramientas acceden a datos publicamente disponibles y te permiten '
    'descubrir que informacion tuya circula en internet. A continuacion se presentan las herramientas mas '
    'importantes organizadas por categoria, junto con instrucciones de uso y recomendaciones practicas.',
    style_body
))

story.append(add_heading('<b>3.1 Verificacion de Credenciales Comprometidas</b>', style_h2, 1))

story.append(add_heading('<b>3.1.1 Have I Been Pwned (HIBP)</b>', style_h3, 1))
story.append(Paragraph(
    'Have I Been Pwned (HIBP) es la herramienta de referencia mundial para verificar si una direccion de '
    'correo electronico o un numero de telefono ha sido comprometido en una filtracion de datos. Creada por '
    'el experto en seguridad Troy Hunt, esta plataforma gratuita mantiene una base de datos actualizada con '
    'miles de millones de registros provenientes de cientos de brechas de seguridad conocidas. Su funcionamiento '
    'es sencillo: ingresas tu correo electronico y la plataforma te muestra en que filtraciones ha aparecido '
    'tu informacion, junto con detalles sobre los tipos de datos que fueron expuestos.',
    style_body
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<b>Como usar HIBP paso a paso:</b> Accede a haveibeenpwned.com e introduce tu direccion de correo '
    'electronico en el campo de busqueda. La plataforma mostrara un listado de todas las brechas de seguridad '
    'en las que tu correo ha aparecido. Para cada brecha, veras el nombre de la empresa afectada, la fecha '
    'de la filtracion, los tipos de datos comprometidos (correos, contrasenas, direcciones, etc.) y una '
    'descripcion del incidente. Ademas, HIBP ofrece una seccion llamada "Pwned Passwords" que te permite '
    'verificar si una contrasena especifica ha sido expuesta en alguna filtracion, sin necesidad de enviar '
    'la contrasena completa al servidor gracias a su sistema de busqueda por fragmentos hash.',
    style_body
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<b>Recomendacion:</b> Activa la opcion de notificaciones para que HIBP te avise automaticamente cuando '
    'tu correo aparezca en nuevas filtraciones. Esto te permitira tomar medidas inmediatas como cambiar '
    'contrasenas o cerrar cuentas comprometidas antes de que los atacantes puedan aprovechar la informacion.',
    style_body
))

story.append(add_heading('<b>3.1.2 DeHashed</b>', style_h3, 1))
story.append(Paragraph(
    'DeHashed es una herramienta mas avanzada que HIBP, orientada a la busqueda detallada de credenciales '
    'filtradas. A diferencia de HIBP, que se limita a indicar si un correo fue parte de una brecha, DeHashed '
    'permite realizar busquedas por multiples criterios: correo electronico, nombre de usuario, numero de '
    'telefono, nombre completo, direccion IP y mas. Esto la convierte en una herramienta indispensable para '
    'una auditoria exhaustiva, ya que permite descubrir exposicion de datos que HIBP podria no cubrir, '
    'especialmente en filtraciones mas recientes o de menor escala que aun no han sido incorporadas a la '
    'base de datos de HIBP.',
    style_body
))
story.append(Spacer(1, 4))
story.append(Paragraph(
    '<b>Como usar DeHashed:</b> Visita dehashed.com y crea una cuenta gratuita o de pago. Utiliza el campo '
    'de busqueda para ingresar tu correo electronico, nombre de usuario o cualquier otro dato que desees '
    'verificar. Los resultados mostraran las bases de datos filtradas en las que aparece tu informacion, '
    'junto con los campos especificos que fueron expuestos. La version de pago ofrece acceso a resultados '
    'completos y busquedas avanzadas con operadores logicos, lo cual es particularmente util para '
    'investigaciones detalladas de la huella digital personal.',
    style_body
))

story.append(add_heading('<b>3.1.3 Inteligencia X</b>', style_h3, 1))
story.append(Paragraph(
    'Inteligencia X (Intelligence X) es un motor de busqueda especializado que indexa datos de la web superficial, '
    'la deep web y la dark web. Permite buscar correos electronicos, dominios, direcciones IP y otros datos '
    'en filtraciones que a menudo no estan disponibles en otras plataformas. Su archivo historico es uno de '
    'los mas extensos, incluyendo brechas que se remontan a mas de una decada. La interfaz permite busquedas '
    'avanzadas y filtrado por fecha, tipo de dato y fuente, lo que facilita la identificacion de exposiciones '
    'que otras herramientas podrian pasar por alto.',
    style_body
))

story.append(add_heading('<b>3.2 Descubrimiento de Cuentas en Linea</b>', style_h2, 1))

story.append(add_heading('<b>3.2.1 OSINT Industries</b>', style_h3, 1))
story.append(Paragraph(
    'OSINT Industries es una herramienta de busqueda en tiempo real que muestra cuales cuentas en linea estan '
    'vinculadas a una direccion de correo electronico, un numero de telefono, un nombre de usuario o incluso '
    'una billetera de criptomonedas. Esta capacidad es invaluable para descubrir cuentas que hayas creado en '
    'el pasado y olvidado, o para identificar si alguien ha creado cuentas usando tu informacion personal sin '
    'tu consentimiento. La herramienta genera un informe detallado con enlaces directos a los perfiles '
    'encontrados, lo que facilita la revision y, si es necesario, la eliminacion de cuentas no deseadas.',
    style_body
))

story.append(add_heading('<b>3.2.2 Epieos</b>', style_h3, 1))
story.append(Paragraph(
    'Epieos es una herramienta especializada en el rastreo de cuentas asociadas a direcciones de correo '
    'electronico. Realiza busquedas en una amplia variedad de plataformas y servicios, revelando en que '
    'sitios se ha registrado un correo determinado. Lo distingue su capacidad para mostrar informacion '
    'adicional como fechas de registro, nombres de usuario asociados y, en algunos casos, fotos de perfil '
    'vinculadas a las cuentas. Es especialmente util para detectar cuentas abandonadas o comprometidas que '
    'podrian estar expuestas a ataques sin que el propietario lo sepa.',
    style_body
))

story.append(add_heading('<b>3.2.3 Namechk / KnowEm</b>', style_h3, 1))
story.append(Paragraph(
    'Namechk y KnowEm son herramientas que permiten verificar la disponibilidad de un nombre de usuario '
    'en cientos de plataformas simultaneamente. Desde la perspectiva de la seguridad personal, son utiles '
    'para descubrir en que sitios estas registrado con un nombre de usuario especifico. Si ingresas tu '
    'nombre de usuario habitual, estas herramientas mostraran en que plataformas esta tomado (lo que indica '
    'que probablemente eres tu quien lo registro) y en cuales esta disponible, lo que tambien te ayuda a '
    'identificar si alguien mas esta usando tu alias para suplantarte.',
    style_body
))

# Table: Comparison of credential tools
story.append(add_heading('<b>3.3 Tabla Comparativa de Herramientas Principales</b>', style_h2, 1))

tbl2_data = [
    [Paragraph('<b>Herramienta</b>', style_table_header),
     Paragraph('<b>Tipo</b>', style_table_header),
     Paragraph('<b>Gratuita</b>', style_table_header),
     Paragraph('<b>Busqueda por</b>', style_table_header),
     Paragraph('<b>Mejor para</b>', style_table_header)],
    [Paragraph('HIBP', style_table_cell),
     Paragraph('Brechas de datos', style_table_cell),
     Paragraph('Si', style_table_cell_c),
     Paragraph('Email, telefono', style_table_cell),
     Paragraph('Verificacion rapida de credenciales', style_table_cell)],
    [Paragraph('DeHashed', style_table_cell),
     Paragraph('Credenciales filtradas', style_table_cell),
     Paragraph('Parcial', style_table_cell_c),
     Paragraph('Email, usuario, IP, nombre', style_table_cell),
     Paragraph('Busqueda detallada de datos expuestos', style_table_cell)],
    [Paragraph('Inteligencia X', style_table_cell),
     Paragraph('Deep/dark web', style_table_cell),
     Paragraph('Parcial', style_table_cell_c),
     Paragraph('Email, dominio, IP', style_table_cell),
     Paragraph('Buscar en filtraciones historicas', style_table_cell)],
    [Paragraph('OSINT Industries', style_table_cell),
     Paragraph('Cuentas en linea', style_table_cell),
     Paragraph('Parcial', style_table_cell_c),
     Paragraph('Email, telefono, usuario, crypto', style_table_cell),
     Paragraph('Descubrir cuentas vinculadas', style_table_cell)],
    [Paragraph('Epieos', style_table_cell),
     Paragraph('Cuentas por email', style_table_cell),
     Paragraph('Si', style_table_cell_c),
     Paragraph('Email', style_table_cell),
     Paragraph('Rastrear registros en plataformas', style_table_cell)],
    [Paragraph('Namechk', style_table_cell),
     Paragraph('Disponibilidad usuario', style_table_cell),
     Paragraph('Si', style_table_cell_c),
     Paragraph('Nombre de usuario', style_table_cell),
     Paragraph('Detectar suplantacion de identidad', style_table_cell)],
]
story.extend(make_table(tbl2_data, [0.14, 0.16, 0.10, 0.26, 0.28], 'Tabla 2: Comparativa de herramientas OSINT para verificacion de datos personales'))

# ═══════════════════════════════════════════
# SECTION 4: Tecnicas de Busqueda Avanzada
# ═══════════════════════════════════════════
story.append(add_heading('<b>4. Tecnicas de Busqueda Avanzada (Google Dorking)</b>', style_h1, 0))

story.append(Paragraph(
    'El Google Dorking, tambien conocido como Google Hacking, es una tecnica que utiliza operadores de '
    'busqueda avanzada para encontrar informacion especifica que normalmente no apareceria en los resultados '
    'de busqueda convencionales. Estos operadores permiten filtrar y refinar las busquedas de manera que se '
    'puedan descubrir documentos indexados, directorios expuestos, bases de datos accesibles y otro tipo de '
    'informacion sensible que los administradores de sitios web no pretendian hacer publica. A continuacion '
    'se presentan los operadores mas utiles para la verificacion de datos personales expuestos.',
    style_body
))

story.append(add_heading('<b>4.1 Operadores de Busqueda Esenciales</b>', style_h2, 1))

tbl3_data = [
    [Paragraph('<b>Operador</b>', style_table_header),
     Paragraph('<b>Funcion</b>', style_table_header),
     Paragraph('<b>Ejemplo de Uso</b>', style_table_header)],
    [Paragraph('site:', style_table_cell),
     Paragraph('Limita la busqueda a un dominio especifico', style_table_cell),
     Paragraph('site:linkedin.com "Tu Nombre"', style_table_cell)],
    [Paragraph('filetype:', style_table_cell),
     Paragraph('Busca archivos de un tipo concreto', style_table_cell),
     Paragraph('filetype:pdf "curriculum" "tu nombre"', style_table_cell)],
    [Paragraph('intitle:', style_table_cell),
     Paragraph('Busca terminos en el titulo de la pagina', style_table_cell),
     Paragraph('intitle:"index of" "tu correo"', style_table_cell)],
    [Paragraph('inurl:', style_table_cell),
     Paragraph('Busca terminos dentro de la URL', style_table_cell),
     Paragraph('inurl:admin "contrasena"', style_table_cell)],
    [Paragraph('"exacto"', style_table_cell),
     Paragraph('Busca la frase exacta entre comillas', style_table_cell),
     Paragraph('"Juan Perez Garcia" +3200000000', style_table_cell)],
    [Paragraph('-', style_table_cell),
     Paragraph('Excluye terminos de la busqueda', style_table_cell),
     Paragraph('"tu nombre" -facebook -twitter', style_table_cell)],
    [Paragraph('OR', style_table_cell),
     Paragraph('Busca uno u otro termino', style_table_cell),
     Paragraph('"tu email" OR "tu telefono"', style_table_cell)],
    [Paragraph('cache:', style_table_cell),
     Paragraph('Muestra la version en cache de una pagina', style_table_cell),
     Paragraph('cache:sitio.com/tu-perfil', style_table_cell)],
]
story.extend(make_table(tbl3_data, [0.14, 0.34, 0.44], 'Tabla 3: Operadores de Google Dorking para verificacion de datos personales'))

story.append(add_heading('<b>4.2 Ejemplos Practicos de Busqueda</b>', style_h2, 1))
story.append(Paragraph(
    'Para buscar informacion sobre ti en internet, comienza por buscar tu nombre completo entre comillas, '
    'junto con identificadores adicionales como tu ciudad, profesion o empresa. Por ejemplo, la busqueda '
    '"Maria Garcia Lopez" "Bogota" abogada te mostrara resultados donde aparecen estos tres terminos juntos, '
    'reduciendo significativamente los falsos positivos. Puedes refinar aun mas agregando el operador de '
    'exclusion para descartar resultados de redes sociales que ya conoces: "Maria Garcia Lopez" -facebook '
    '-instagram -twitter, lo que te ayudara a descubrir menciones en sitios que no esperabas.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Para buscar tu correo electronico, intenta busquedas como: "tu.email@dominio.com" filetype:pdf para '
    'encontrar documentos que contengan tu correo, o intitle:"index of" "tu.email@dominio.com" para '
    'descubrir directorios abiertos que lo mencionen. Tambien puedes buscar combinaciones como site:pastebin.com '
    '"tu correo" para verificar si tu informacion ha sido publicada en sitios de pegado de texto, que son '
    'comunmente utilizados para distribuir datos filtrados. Estas busquedas son particularmente efectivas '
    'para descubrir exposiciones que las herramientas automatizadas podrian no detectar.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 5: Herramientas avanzadas
# ═══════════════════════════════════════════
story.append(add_heading('<b>5. Herramientas Avanzadas de Analisis</b>', style_h1, 0))

story.append(add_heading('<b>5.1 Shodan: El Buscador de Dispositivos Conectados</b>', style_h2, 1))
story.append(Paragraph(
    'Shodan es un motor de busqueda especializado que indexa dispositivos conectados a internet, incluyendo '
    'servidores, camaras de seguridad, routers, dispositivos IoT y sistemas de control industrial. Desde la '
    'perspectiva de la privacidad personal, Shodan permite verificar si dispositivos en tu red domestica o '
    'de tu empresa estan expuestos en internet. Puedes buscar por tu direccion IP publica para descubrir '
    'que servicios y puertos estan visibles desde el exterior. Tambien puedes buscar por tu ciudad o ISP '
    'para identificar dispositivos vulnerables en tu zona que podrian comprometer la seguridad de tu red.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Como usar Shodan para tu auditoria:</b> Accede a shodan.io y crea una cuenta gratuita. Busca tu '
    'direccion IP publica (puedes obtenerla desde whatismyip.com) en el campo de busqueda de Shodan. Los '
    'resultados mostraran los puertos abiertos, los servicios que estan ejecutandose y las vulnerabilidades '
    'conocidas asociadas a las versiones de software detectadas. Si encuentras dispositivos o servicios que '
    'no deberian estar expuestos, debes configurar tu router o firewall para cerrar esos puertos o restringir '
    'el acceso solo a redes confiables.',
    style_body
))

story.append(add_heading('<b>5.2 theHarvester: Recopilacion de Correos y Subdominios</b>', style_h2, 1))
story.append(Paragraph(
    'theHarvester es una herramienta de linea de comandos que recopila correos electronicos, subdominios, '
    'nombres de host y direcciones IP asociados a un dominio especifico. Aunque fue disenada principalmente '
    'para pentesting corporativo, es igualmente util para la verificacion personal: si tienes un dominio '
    'propio (por ejemplo, para un sitio web personal o un negocio), theHarvester puede mostrarte que '
    'informacion esta expuesta publicamente. Los correos electronicos que la herramienta descubre son '
    'frecuentemente el objetivo de ataques de phishing, por lo que saber cuales estan visibles es crucial '
    'para tu seguridad digital.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Instalacion y uso basico:</b> theHarvester viene preinstalado en distribuciones de pentesting como '
    'Kali Linux. Para instalarlo manualmente, ejecuta: pip install theHarvester. Para buscar correos '
    'asociados a tu dominio, ejecuta: theHarvester -d tudominio.com -b google,bing,linkedin. Esto buscara '
    'en los motores especificados y mostrara los correos electronicos, subdominios y hosts encontrados.',
    style_body
))

story.append(add_heading('<b>5.3 Maltego: Visualizacion de Relaciones</b>', style_h2, 1))
story.append(Paragraph(
    'Maltego es una plataforma de analisis de datos que permite visualizar las relaciones entre diferentes '
    'entidades como personas, organizaciones, dominios, direcciones de correo y numeros de telefono. Su '
    'interfaz grafica genera diagramas de red que muestran como los datos estan interconectados, lo cual '
    'es especialmente valioso para comprender la magnitud de tu exposicion digital. Por ejemplo, al buscar '
    'tu correo electronico, Maltego puede mostrar automaticamente todas las cuentas, dominios y personas '
    'asociadas, revelando conexiones que no serian evidentes con busquedas individuales.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'La version gratuita (Maltego CE) ofrece funcionalidad suficiente para auditorias personales. Permite '
    'ejecutar transformaciones que buscan automaticamente en multiples fuentes de datos y generan grafos '
    'interactivos. Para una auditoria personal, puedes comenzar creando un nodo con tu correo electronico '
    'y ejecutar transformaciones para descubrir cuentas asociadas, dominios vinculados y personas conectadas. '
    'El resultado es un mapa visual completo de tu huella digital que facilita la identificacion de vectores '
    'de exposicion que podrian pasar desapercibidos con herramientas de busqueda convencionales.',
    style_body
))

story.append(add_heading('<b>5.4 SpiderFoot: Automatizacion de la Investigacion</b>', style_h2, 1))
story.append(Paragraph(
    'SpiderFoot es una herramienta de automatizacion de OSINT que integra mas de 200 fuentes de datos en '
    'una sola interfaz. Permite realizar escaneos completos a partir de un unico dato (como un correo '
    'electronico o una direccion IP) y recopilar automaticamente informacion de multiples fuentes: '
    'registros WHOIS, redes sociales, brechas de datos, motores de busqueda, sitios de pastebin, '
    'servidores DNS y muchos mas. La ventaja principal de SpiderFoot es que automatiza lo que de otra '
    'forma requeriria decenas de busquedas manuales, generando un informe consolidado con todos los '
    'hallazgos organizados por categoria y nivel de riesgo.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 6: Guia paso a paso
# ═══════════════════════════════════════════
story.append(add_heading('<b>6. Guia Paso a Paso para tu Auditoria Personal</b>', style_h1, 0))

story.append(Paragraph(
    'Realizar una auditoria completa de tu huella digital requiere un enfoque sistematico. A continuacion '
    'se presenta un proceso estructurado que cubre desde la verificacion de credenciales comprometidas '
    'hasta la revision de metadatos en tus archivos, pasando por el descubrimiento de cuentas abandonadas '
    'y la verificacion de tu presencia en la dark web.',
    style_body
))

steps_data = [
    [Paragraph('<b>Paso</b>', style_table_header),
     Paragraph('<b>Accion</b>', style_table_header),
     Paragraph('<b>Herramienta(s)</b>', style_table_header),
     Paragraph('<b>Tiempo Estimado</b>', style_table_header)],
    [Paragraph('1', style_table_cell_c),
     Paragraph('Verificar correos en filtraciones de datos', style_table_cell),
     Paragraph('HIBP, DeHashed', style_table_cell),
     Paragraph('10 minutos', style_table_cell_c)],
    [Paragraph('2', style_table_cell_c),
     Paragraph('Buscar contrasenas comprometidas', style_table_cell),
     Paragraph('HIBP Pwned Passwords', style_table_cell),
     Paragraph('5 minutos', style_table_cell_c)],
    [Paragraph('3', style_table_cell_c),
     Paragraph('Descubrir cuentas vinculadas a tu correo', style_table_cell),
     Paragraph('OSINT Industries, Epieos', style_table_cell),
     Paragraph('15 minutos', style_table_cell_c)],
    [Paragraph('4', style_table_cell_c),
     Paragraph('Buscar tu nombre y datos en Google', style_table_cell),
     Paragraph('Google Dorking', style_table_cell),
     Paragraph('20 minutos', style_table_cell_c)],
    [Paragraph('5', style_table_cell_c),
     Paragraph('Verificar presencia en dark web', style_table_cell),
     Paragraph('Inteligencia X, SpiderFoot', style_table_cell),
     Paragraph('15 minutos', style_table_cell_c)],
    [Paragraph('6', style_table_cell_c),
     Paragraph('Revisar metadatos EXIF de fotos publicas', style_table_cell),
     Paragraph('ExifTool, Jeffrey Exif Viewer', style_table_cell),
     Paragraph('10 minutos', style_table_cell_c)],
    [Paragraph('7', style_table_cell_c),
     Paragraph('Verificar dispositivos expuestos en tu red', style_table_cell),
     Paragraph('Shodan', style_table_cell),
     Paragraph('10 minutos', style_table_cell_c)],
    [Paragraph('8', style_table_cell_c),
     Paragraph('Generar mapa visual de tu huella digital', style_table_cell),
     Paragraph('Maltego', style_table_cell),
     Paragraph('30 minutos', style_table_cell_c)],
]
story.extend(make_table(steps_data, [0.07, 0.38, 0.30, 0.17], 'Tabla 4: Plan de auditoria personal paso a paso'))

story.append(add_heading('<b>6.1 Verificacion de Metadatos EXIF</b>', style_h2, 1))
story.append(Paragraph(
    'Los metadatos EXIF (Exchangeable Image File Format) son informacion incrustada en las fotografias '
    'digitales que puede incluir la fecha y hora de la captura, el modelo de la camara, la configuracion '
    'de la toma y, mas preocupante, las coordenadas GPS exactas donde se tomo la foto. Muchas personas '
    'suben fotos a redes sociales sin darse cuenta de que estos metadatos estan presentes y pueden ser '
    'extraidos por cualquier persona que descargue la imagen. Para verificar si tus fotos contienen '
    'metadatos sensibles, puedes usar herramientas como ExifTool (linea de comandos) o el Jeffrey Exif '
    'Viewer (en linea). Si encuentras coordenadas GPS en tus fotos publicas, debes eliminar los metadatos '
    'antes de compartir nuevas imagenes y considerar si las ubicaciones ya reveladas representan un riesgo.',
    style_body
))

story.append(add_heading('<b>6.2 Auditoria de Redes Sociales</b>', style_h2, 1))
story.append(Paragraph(
    'Las redes sociales son una de las principales fuentes de exposicion de datos personales. Para auditar '
    'tu presencia, revisa la configuracion de privacidad de cada plataforma donde tienes cuenta: Facebook, '
    'Instagram, LinkedIn, Twitter/X, TikTok y cualquier otra. Verifica quien puede ver tu informacion '
    'personal (fecha de nacimiento, correo, telefono), tus publicaciones y tu lista de amigos o contactos. '
    'Muchas plataformas cambian sus politicas de privacidad con el tiempo, por lo que configuraciones que '
    'eran privadas pueden haberse vuelto publicas sin que te dieras cuenta. Ademas, busca tu propio perfil '
    'usando una ventana de navegacion en modo incognito para ver exactamente lo que un desconocido podria '
    'ver al buscar tu nombre.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 7: Medidas de proteccion
# ═══════════════════════════════════════════
story.append(add_heading('<b>7. Medidas de Proteccion y Mitigacion</b>', style_h1, 0))

story.append(Paragraph(
    'Una vez que has identificado que datos tuyos estan expuestos, el siguiente paso critico es tomar medidas '
    'para proteger esa informacion y minimizar el riesgo. Las acciones pueden dividirse en tres categorias: '
    'acciones inmediatas para datos criticamente expuestos, acciones a mediano plazo para reducir tu huella '
    'digital y habitos a largo plazo para mantener tu privacidad.',
    style_body
))

story.append(add_heading('<b>7.1 Acciones Inmediatas</b>', style_h2, 1))
story.append(Paragraph(
    '<b>Cambiar contrasenas comprometidas:</b> Si descubres que alguna de tus contrasenas ha sido expuesta '
    'en una filtracion, cambiala inmediatamente en todos los sitios donde la utilizas. Nunca reutilices '
    'contrasenas entre diferentes servicios. Utiliza un gestor de contrasenas como Bitwarden, 1Password o '
    'KeePass para generar y almacenar contrasenas unicas y complejas para cada cuenta. La reutilizacion de '
    'contrasenas es una de las mayores vulnerabilidades: si un sitio sufre una brecha, los atacantes intentan '
    'automaticamente las mismas credenciales en otros servicios populares, un ataque conocido como credential '
    'stuffing.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Activar autenticacion de dos factores (2FA):</b> Habilita la autenticacion en dos pasos en todas las '
    'cuentas que lo permitan, especialmente en correo electronico, redes sociales, servicios financieros y '
    'almacenamiento en la nube. Prefiere aplicaciones autenticadoras (como Google Authenticator o Authy) o '
    'llaves de seguridad hardware (como YubiKey) sobre SMS, ya que los codigos por SMS pueden ser '
    'interceptados mediante ataques SIM swapping. La 2FA agrega una capa de seguridad critica que protege '
    'tu cuenta incluso si tu contrasena ha sido comprometida.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Cerrar cuentas abandonadas:</b> Si descubres cuentas que ya no usas, cierralas definitivamente. '
    'Las cuentas abandonadas son un riesgo significativo porque suelen tener contrasenas debiles que no se '
    'han actualizado, y los datos personales asociados siguen siendo accesibles para los atacantes. Antes de '
    'cerrar una cuenta, elimina cualquier dato personal que contenga y verifica que el servicio ofrezca la '
    'opcion de eliminacion completa (no solo desactivacion).',
    style_body
))

story.append(add_heading('<b>7.2 Acciones a Mediano Plazo</b>', style_h2, 1))
story.append(Paragraph(
    '<b>Solicitar la eliminacion de datos a brokers de informacion:</b> Los data brokers recopilan y venden '
    'informacion personal de multiples fuentes publicas y privadas. Muchos de estos servicios estan '
    'obligados por ley (como el CCPA en California o el GDPR en Europa) a eliminar tus datos si lo '
    'solicitas. Servicios como DeleteMe, PrivacyDuck o Optery pueden automatizar este proceso por una '
    'tarifa, o puedes hacerlo manualmente contactando a cada broker individualmente. El proceso puede tomar '
    'varias semanas, pero reduce significativamente la cantidad de informacion personal disponible en '
    'directorios publicos.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Eliminar metadatos de archivos antes de compartirlos:</b> Antes de subir cualquier archivo a '
    'internet, especialmente fotografias y documentos, elimina los metadatos. Puedes usar ExifTool para '
    'imagenes, o las opciones integradas de tu sistema operativo. En Windows, haz clic derecho en el '
    'archivo, selecciona Propiedades y elimina las propiedades personales. En macOS, usa la opcion '
    'de eliminar metadatos en Vista previa. Para documentos PDF, herramientas como mat2 (Metadata '
    'Anonymisation Toolkit 2) pueden limpiar metadatos de forma fiable.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    '<b>Revisar y restringir permisos de aplicaciones:</b> Audita las aplicaciones instaladas en tus '
    'dispositivos moviles y revoca los permisos innecesarios. Muchas aplicaciones solicitan acceso a '
    'tu lista de contactos, ubicacion, camara o microfono sin una justificacion valida. En Android, ve '
    'a Configuracion > Privacidad > Administrador de permisos. En iOS, ve a Configuracion > Privacidad '
    'y Seguridad. Desactiva los permisos que no sean esenciales para el funcionamiento de cada aplicacion.',
    style_body
))

story.append(add_heading('<b>7.3 Habitos a Largo Plazo</b>', style_h2, 1))

tbl4_data = [
    [Paragraph('<b>Habito</b>', style_table_header),
     Paragraph('<b>Descripcion</b>', style_table_header),
     Paragraph('<b>Frecuencia</b>', style_table_header)],
    [Paragraph('Verificar HIBP', style_table_cell),
     Paragraph('Revisar si tus correos aparecen en nuevas filtraciones', style_table_cell),
     Paragraph('Mensual', style_table_cell_c)],
    [Paragraph('Auditar configuracion de privacidad', style_table_cell),
     Paragraph('Revisar la configuracion de privacidad en redes sociales y servicios', style_table_cell),
     Paragraph('Trimestral', style_table_cell_c)],
    [Paragraph('Actualizar contrasenas', style_table_cell),
     Paragraph('Cambiar contrasenas de cuentas criticas usando el gestor de contrasenas', style_table_cell),
     Paragraph('Semestral', style_table_cell_c)],
    [Paragraph('Escaneo de huella digital', style_table_cell),
     Paragraph('Realizar una auditoria OSINT completa de tu huella digital', style_table_cell),
     Paragraph('Anual', style_table_cell_c)],
    [Paragraph('Revisar permisos de apps', style_table_cell),
     Paragraph('Auditar los permisos otorgados a aplicaciones en tus dispositivos', style_table_cell),
     Paragraph('Trimestral', style_table_cell_c)],
    [Paragraph('Eliminar datos de brokers', style_table_cell),
     Paragraph('Solicitar la eliminacion de tus datos a data brokers y directorios publicos', style_table_cell),
     Paragraph('Semestral', style_table_cell_c)],
]
story.extend(make_table(tbl4_data, [0.25, 0.52, 0.17], 'Tabla 5: Habitos de proteccion digital a largo plazo'))

# ═══════════════════════════════════════════
# SECTION 8: Consideraciones legales
# ═══════════════════════════════════════════
story.append(add_heading('<b>8. Consideraciones Legales y Eticas</b>', style_h1, 0))

story.append(Paragraph(
    'Es fundamental entender el marco legal y etico que rodea la verificacion de datos personales expuestos. '
    'Utilizar herramientas OSINT para investigar tu propia huella digital es completamente legal: estas '
    'herramientas acceden exclusivamente a informacion publicamente disponible y no requieren acceso no '
    'autorizado a sistemas o bases de datos. Sin embargo, las mismas herramientas pueden ser utilizadas '
    'de forma indebida si se aplican para investigar a terceros sin su consentimiento o para fines de acoso.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Desde la perspectiva legal, varias jurisdicciones ofrecen protecciones para los datos personales. '
    'El Reglamento General de Proteccion de Datos (GDPR) de la Union Europea otorga a los ciudadanos '
    'el derecho al olvido, el derecho de acceso y el derecho de rectificacion de sus datos personales. '
    'En America Latina, legislaciones como la Ley 1581 de 2012 en Colombia, la Ley Federal de Proteccion '
    'de Datos Personales en Mexico y la Ley de Proteccion de Datos Personales en Argentina establecen '
    'marcos similares. Estos marcos legales te permiten solicitar a las empresas la eliminacion de tus '
    'datos, acceder a la informacion que tienen sobre ti y rectificar datos incorrectos.',
    style_body
))
story.append(Spacer(1, 6))
story.append(Paragraph(
    'Es importante destacar que el uso de herramientas OSINT para fines de autoproiteccion es eticamente '
    'irreprochable y legalmente seguro. Las herramientas mencionadas en esta guia estan disenadas para '
    'acceder a datos publicamente accesibles y no implican hackeo, intrusion ni violacion de sistemas. '
    'Sin embargo, debes evitar usar estas mismas tecnicas para investigar a otras personas sin su '
    'consentimiento, ya que esto podria violar las leyes de privacidad y proteccion de datos de tu '
    'jurisdiccion. Siempre aplica el principio de uso proporcionado y responsable: utiliza solo la '
    'informacion necesaria para proteger tu propia seguridad digital.',
    style_body
))

# ═══════════════════════════════════════════
# SECTION 9: Recursos adicionales
# ═══════════════════════════════════════════
story.append(add_heading('<b>9. Recursos Adicionales</b>', style_h1, 0))

tbl5_data = [
    [Paragraph('<b>Recurso</b>', style_table_header),
     Paragraph('<b>URL</b>', style_table_header),
     Paragraph('<b>Descripcion</b>', style_table_header)],
    [Paragraph('Have I Been Pwned', style_table_cell),
     Paragraph('haveibeenpwned.com', style_table_cell),
     Paragraph('Verificacion de credenciales comprometidas', style_table_cell)],
    [Paragraph('DeHashed', style_table_cell),
     Paragraph('dehashed.com', style_table_cell),
     Paragraph('Busqueda avanzada de datos filtrados', style_table_cell)],
    [Paragraph('Inteligencia X', style_table_cell),
     Paragraph('intelx.io', style_table_cell),
     Paragraph('Motor de busqueda en deep/dark web', style_table_cell)],
    [Paragraph('OSINT Framework', style_table_cell),
     Paragraph('osintframework.com', style_table_cell),
     Paragraph('Directorio de herramientas OSINT', style_table_cell)],
    [Paragraph('Shodan', style_table_cell),
     Paragraph('shodan.io', style_table_cell),
     Paragraph('Buscador de dispositivos conectados', style_table_cell)],
    [Paragraph('ExifTool', style_table_cell),
     Paragraph('exiftool.org', style_table_cell),
     Paragraph('Analisis y eliminacion de metadatos', style_table_cell)],
    [Paragraph('Maltego', style_table_cell),
     Paragraph('maltego.com', style_table_cell),
     Paragraph('Visualizacion de relaciones de datos', style_table_cell)],
    [Paragraph('SpiderFoot', style_table_cell),
     Paragraph('spiderfoot.net', style_table_cell),
     Paragraph('Automatizacion de investigacion OSINT', style_table_cell)],
    [Paragraph('DeleteMe', style_table_cell),
     Paragraph('joindeleteme.com', style_table_cell),
     Paragraph('Eliminacion de datos de brokers', style_table_cell)],
    [Paragraph('OWASP', style_table_cell),
     Paragraph('owasp.org', style_table_cell),
     Paragraph('Recursos de seguridad en aplicaciones web', style_table_cell)],
]
story.extend(make_table(tbl5_data, [0.22, 0.26, 0.44], 'Tabla 6: Recursos adicionales para la verificacion y proteccion de datos personales'))

story.append(Spacer(1, 24))
story.append(Paragraph(
    'La proteccion de tus datos personales es un proceso continuo, no una accion puntual. Las amenazas '
    'evolucionan constantemente, nuevas filtraciones ocurren con regularidad y las plataformas cambian sus '
    'politicas de privacidad. Mantener una actitud proactiva, auditar periodicamente tu huella digital y '
    'aplicar las medidas de proteccion descritas en esta guia te permitira reducir significativamente el '
    'riesgo de que tus datos personales sean utilizados de forma maliciosa.',
    style_body
))

# ── Build PDF ──
OUTPUT_DIR = '/home/z/my-project/download'
BODY_PDF = os.path.join(OUTPUT_DIR, 'guia_datos_expuestos_body.pdf')
FINAL_PDF = os.path.join(OUTPUT_DIR, 'guia_verificar_datos_personales_expuestos.pdf')

doc = TocDocTemplate(
    BODY_PDF,
    pagesize=A4,
    leftMargin=LEFT_MARGIN,
    rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN,
    bottomMargin=BOTTOM_MARGIN,
    title='Guia para Verificar tus Datos Personales Expuestos en Internet',
    author='Z.ai',
    creator='Z.ai',
    subject='Seguridad digital, OSINT, verificacion de datos personales'
)

doc.multiBuild(story)
print(f'Body PDF generated: {BODY_PDF}')
