"""Генерирует «объёмные» SVG-иллюстрации для карточек курсов и вставляет их в index.html."""
import re, pathlib
C = {  # base, dark, light
 'or': ('#FF8A00', '#B35500', '#FFD199'),
 'bl': ('#4C6EF5', '#2A3FA8', '#B3C3FF'),
 'gr': ('#00B39F', '#0A7D70', '#7FE2D3'),
 'pu': ('#8E5CF0', '#5A31B0', '#D6C2FF'),
 'gy': ('#9FB4BB', '#4D6670', '#E8F3F1'),
}
def tube(d, c, w, extra=''):
    b, dk, lt = C[c]; o = w * .17
    return (f'<g {extra}><path d="{d}" fill="none" stroke="{dk}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<path d="{d}" fill="none" stroke="{b}" stroke-width="{w*.78:.1f}" stroke-linecap="round" stroke-linejoin="round" transform="translate({-o*.5:.1f} {-o*.5:.1f})"/>'
            f'<path d="{d}" fill="none" stroke="{lt}" stroke-width="{w*.22:.1f}" stroke-linecap="round" stroke-linejoin="round" opacity=".85" transform="translate({-o*1.3:.1f} {-o*1.3:.1f})"/></g>')
def ball(x, y, r, c):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#ball-{c})"/>'
def ground(x, y, rx):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{rx*.14:.1f}" fill="#000" opacity=".13" filter="url(#blur)"/>'
def panel(x, y, w, h, r=16, fill='url(#panel)'):
    return (f'<rect x="{x}" y="{y+5}" width="{w}" height="{h}" rx="{r}" fill="var(--ill-panel-edge)"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"/>'
            f'<rect x="{x+6}" y="{y+4}" width="{w-12}" height="6" rx="3" fill="var(--ill-shine)"/>')

defs = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' + ''.join(
    f'<radialGradient id="ball-{k}" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="{v[2]}"/><stop offset=".45" stop-color="{v[0]}"/><stop offset="1" stop-color="{v[1]}"/></radialGradient>'
    for k, v in C.items()) + (
    '<linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ill-panel-top)"/><stop offset="1" stop-color="var(--ill-panel)"/></linearGradient>'
    '<linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17404b"/><stop offset="1" stop-color="#0b1d24"/></linearGradient>'
    '<filter id="blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="4"/></filter>'
    '<filter id="ds" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".18"/></filter>'
    '</defs></svg>')

def svg(body, label):
    return f'<svg class="card-art" viewBox="0 0 240 150" role="img" aria-label="{label}">{body}</svg>'

# ЕГЭ профиль: график параболы с касательной
prof = svg(ground(120, 138, 92) + f'<g filter="url(#ds)">{panel(36, 14, 168, 116)}</g>'
    + tube('M58 112 H186', 'gy', 5) + tube('M70 122 V30', 'gy', 5)
    + tube('M78 40 Q122 150 170 42', 'or', 13)
    + tube('M107 111 L175 65', 'bl', 8)
    + ball(137, 91, 9, 'bl'), 'График функции и касательная')
# ЕГЭ база: знак процента и монеты
base = svg(ground(120, 138, 90)
    + tube('M146 34 L96 122', 'or', 16)
    + tube('M84 54 m-17 0 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0', 'bl', 12)
    + tube('M158 104 m-17 0 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0', 'bl', 12)
    + ball(196, 120, 12, 'gr') + ball(46, 116, 9, 'or'), 'Знак процента')
# ОГЭ: треугольник со вписанной окружностью
oge = svg(ground(120, 140, 80)
    + tube('M60 126 L180 126 L120 22 Z', 'gr', 11)
    + tube('M120 92 m-31 0 a31 31 0 1 0 62 0 a31 31 0 1 0 -62 0', 'or', 9)
    + ball(120, 92, 6, 'bl') + ball(196, 46, 9, 'bl') + ball(42, 70, 7, 'or'), 'Треугольник со вписанной окружностью')
# Информатика: монитор с командной строкой
inf = svg(ground(120, 140, 80) + tube('M120 116 V130 M96 132 H144', 'gy', 9)
    + f'<g filter="url(#ds)">{panel(46, 14, 148, 102, 16, "var(--ill-monitor)")}<rect x="56" y="24" width="128" height="80" rx="10" fill="url(#screen)"/></g>'
    + tube('M78 46 L96 62 L78 78', 'or', 10) + tube('M108 80 H140', 'gr', 10)
    + ball(196, 40, 8, 'bl'), 'Монитор с командной строкой')
# Физика: атом
atom = ''.join(f'<g transform="rotate({a} 120 74)">' + tube('M120 74 m-68 0 a68 24 0 1 0 136 0 a68 24 0 1 0 -136 0', 'pu', 8) + '</g>' for a in (0, 60, 120))
phys = svg(ground(120, 140, 70) + atom + ball(120, 74, 17, 'or') + ball(188, 74, 7, 'bl') + ball(86, 133, 7, 'bl') + ball(86, 15, 7, 'bl'), 'Модель атома')

p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
s = p.read_text()
for key, art in {'prof': prof, 'base': base, 'oge': oge, 'inf': inf, 'phys': phys, 'defs': defs}.items():
    s = re.sub(rf'<!--art:{key}-->.*?<!--/art-->', f'<!--art:{key}-->{art}<!--/art-->', s, flags=re.S)
p.write_text(s)
print('ok')
