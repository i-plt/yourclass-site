"""Плоские цветные иконки для карточек курсов (Minimal UI) — вставляются в index.html."""
import re, pathlib
OR, BL, GR, PU = '#ff8a00', '#4c6ef5', '#00b39f', '#8e5cf0'
INK = 'var(--text)'
def svg(body, label):
    return f'<svg class="card-art" viewBox="0 0 240 150" role="img" aria-label="{label}">{body}</svg>'
def card(x, y, w, h, r=14):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>'
def grid(x, y, w, h, step):
    g = ''.join(f'<path d="M{x+i} {y}V{y+h}"/>' for i in range(step, w, step)) + ''.join(f'<path d="M{x} {y+j}H{x+w}"/>' for j in range(step, h, step))
    return f'<g stroke="var(--line)" stroke-width="1.5">{g}</g>'
def dot(x, y, r, c, ring=True):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"' + (' stroke="var(--surface)" stroke-width="2.5"' if ring else '') + '/>'
def line(d, c, w=4):
    return f'<path d="{d}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'

# ЕГЭ профиль: график параболы и точная касательная
import math
P0, P1, P2 = (84, 38), (122, 150), (164, 38)
def bez(t): return tuple((1-t)**2*P0[i] + 2*t*(1-t)*P1[i] + t*t*P2[i] for i in (0, 1))
def dbez(t): return tuple(2*(1-t)*(P1[i]-P0[i]) + 2*t*(P2[i]-P1[i]) for i in (0, 1))
t0 = .68; (tx, ty), (dx, dy) = bez(t0), dbez(t0); n = math.hypot(dx, dy); dx, dy = dx/n, dy/n
prof = svg(card(30, 12, 180, 126) + grid(46, 26, 148, 98, 18)
    + line('M58 112H188', INK, 2.5) + line('M70 118V30', INK, 2.5)
    + line('M84 38Q122 150 164 38', OR, 5)
    + line(f'M{tx-dx*34:.1f} {ty-dy*34:.1f}L{tx+dx*40:.1f} {ty+dy*40:.1f}', BL, 4)
    + dot(round(tx, 1), round(ty, 1), 6, BL),
    'График функции и касательная')
# ЕГЭ база: столбики диаграммы по центру, знак процента слева
base = svg(card(30, 12, 180, 126)
    + '<rect x="84" y="82" width="26" height="40" rx="6" fill="' + BL + '"/>'
    + '<rect x="118" y="58" width="26" height="64" rx="6" fill="' + GR + '"/>'
    + '<rect x="152" y="40" width="26" height="82" rx="6" fill="' + OR + '"/>'
    + line('M74 124H188', INK, 2.5)
    + f'<circle cx="58" cy="44" r="18" fill="{PU}"/>'
    + line('M65 37L51 51', '#fff', 3.5) + '<circle cx="52" cy="38" r="3" fill="#fff"/><circle cx="64" cy="50" r="3" fill="#fff"/>',
    'Диаграмма и знак процента')
# ОГЭ: треугольник в узлах клетки, вписанная окружность (центр и радиус посчитаны)
A, B, Cc = (58, 110), (184, 110), (142, 40)
la, lb, lc = math.dist(B, Cc), math.dist(A, Cc), math.dist(A, B); per = la + lb + lc
ix = (la*A[0] + lb*B[0] + lc*Cc[0]) / per; iy = (la*A[1] + lb*B[1] + lc*Cc[1]) / per
s_ = per / 2; area = abs((B[0]-A[0])*(Cc[1]-A[1]) - (Cc[0]-A[0])*(B[1]-A[1])) / 2; r_in = area / s_
rc = r_in - 3.5  # кольцо касается внутреннего края линии треугольника
oge = svg(card(30, 12, 180, 126) + grid(44, 26, 152, 98, 14)
    + f'<path d="M{A[0]} {A[1]}L{B[0]} {B[1]}L{Cc[0]} {Cc[1]}Z" fill="{GR}" fill-opacity=".14" stroke="{GR}" stroke-width="5" stroke-linejoin="round"/>'
    + f'<circle cx="{ix:.1f}" cy="{iy:.1f}" r="{rc:.1f}" fill="{OR}" fill-opacity=".18" stroke="{OR}" stroke-width="4"/>'
    + dot(round(ix, 1), round(iy, 1), 4, OR, False) + dot(*A, 6, BL) + dot(*B, 6, BL) + dot(*Cc, 6, BL),
    'Треугольник со вписанной окружностью на клетчатой бумаге')
# Информатика: окно терминала и таблица
inf = svg(card(24, 14, 150, 104)
    + f'<path d="M24 40H174V28a14 14 0 0 0 -14 -14H38a14 14 0 0 0 -14 14Z" fill="{BL}"/>'
    + dot(40, 27, 3.5, '#fff', False) + dot(52, 27, 3.5, '#fff', False) + dot(64, 27, 3.5, '#fff', False)
    + line('M42 58L58 70L42 82', OR, 5) + line('M68 84H112', GR, 5) + line('M68 100H96', INK, 3.5)
    + card(132, 62, 84, 72, 10)
    + f'<path d="M132 72a10 10 0 0 1 10 -10H206a10 10 0 0 1 10 10V80H132Z" fill="{GR}"/>'
    + '<g stroke="var(--line)" stroke-width="2"><path d="M160 80V134M188 80V134M132 102H216M132 118H216"/></g>'
    + f'<rect x="164" y="104" width="20" height="12" rx="3" fill="{OR}"/>',
    'Окно терминала и электронная таблица')
# Физика: атом
orb = ''.join(f'<ellipse cx="120" cy="74" rx="66" ry="24" fill="none" stroke="{PU}" stroke-width="4" transform="rotate({a} 120 74)"/>' for a in (0, 60, 120))
phys = svg(f'<circle cx="120" cy="74" r="62" fill="var(--bg)"/>' + orb + dot(120, 74, 15, OR) + dot(186, 74, 7, BL) + dot(87, 131, 7, BL) + dot(87, 17, 7, GR),
    'Модель атома')

p = pathlib.Path(__file__).resolve().parent.parent / 'index.html'
s = p.read_text()
for key, art in {'prof': prof, 'base': base, 'oge': oge, 'inf': inf, 'phys': phys, 'defs': ''}.items():
    s = re.sub(rf'<!--art:{key}-->.*?<!--/art-->', f'<!--art:{key}-->{art}<!--/art-->', s, flags=re.S)
p.write_text(s)
print('ok')
