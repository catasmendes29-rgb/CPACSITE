from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Documentos\New project")
ASSETS = ROOT / "public" / "assets"
OUT_DIR = ROOT / "outputs" / "guia-delegado-atualizado"
PDF_PATH = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Ambiente de Trabalho\Guia_Delegado_Casa_Pia_AC_Live_atualizado.pdf")

W, H = 1600, 1100
BLACK = "#050505"
PANEL = "#101010"
WHITE = "#ffffff"
GOLD = "#b59a43"
GOLD_DARK = "#8c7329"
RED = "#df1f2d"
MUTED = "#d8d8d8"
LINE = "#2c2c2c"


def font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


F = {
    "title": font(72, True),
    "h1": font(44, True),
    "h2": font(30, True),
    "h3": font(23, True),
    "body": font(23),
    "small": font(18),
    "tiny": font(15, True),
}


def paste_fit(base, image_path, box, keep_alpha=True):
    img = Image.open(image_path).convert("RGBA")
    x, y, w, h = box
    img.thumbnail((w, h), Image.LANCZOS)
    px = x + (w - img.width) // 2
    py = y + (h - img.height) // 2
    if keep_alpha:
        base.alpha_composite(img, (px, py))
    else:
        base.paste(img.convert("RGB"), (px, py))


def text(draw, xy, value, fill=WHITE, f=None, max_width=None, line_gap=8):
    f = f or F["body"]
    x, y = xy
    if not max_width:
        draw.text((x, y), value, fill=fill, font=f)
        return y + f.size + line_gap
    avg = max(8, f.size * 0.52)
    chars = max(18, int(max_width / avg))
    for paragraph in str(value).split("\n"):
        for line in wrap(paragraph, width=chars) or [""]:
            draw.text((x, y), line, fill=fill, font=f)
            y += f.size + line_gap
    return y


def bullet(draw, x, y, value, fill=WHITE, max_width=680):
    draw.rectangle((x, y + 10, x + 10, y + 20), fill=GOLD)
    return text(draw, (x + 24, y), value, fill=fill, f=F["body"], max_width=max_width)


def page(title, subtitle=None):
    img = Image.new("RGBA", (W, H), BLACK)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 118), fill=BLACK)
    d.line((0, 118, W, 118), fill=GOLD_DARK, width=3)
    paste_fit(img, ASSETS / "logo.png", (36, 20, 78, 78))
    d.text((132, 30), "CASA PIA AC", fill=WHITE, font=F["h3"])
    d.text((132, 62), "FUTEBOL FEMININO - LIVE", fill=GOLD, font=F["small"])
    paste_fit(img, ASSETS / "goldganso.png", (1460, 18, 76, 76))
    d.text((70, 166), title, fill=WHITE, font=F["h1"])
    if subtitle:
        d.text((70, 218), subtitle, fill=GOLD, font=F["h3"])
    return img, d


def card(draw, box, title, subtitle=None, fill=PANEL, outline=LINE):
    draw.rectangle(box, fill=fill, outline=outline, width=2)
    x, y, _, _ = box
    draw.text((x + 28, y + 24), title, fill=WHITE, font=F["h2"])
    if subtitle:
        text(draw, (x + 28, y + 72), subtitle, fill=MUTED, f=F["body"], max_width=box[2] - box[0] - 56)


def draw_delegate_mock(draw, x, y):
    draw.rectangle((x, y, x + 660, y + 520), fill="#f7f7f7", outline=GOLD_DARK, width=2)
    draw.rectangle((x + 24, y + 24, x + 214, y + 470), fill="#ffffff", outline="#dddddd")
    draw.text((x + 44, y + 48), "JOGO", fill=BLACK, font=F["h3"])
    labels = ["Escalão", "Partida", "Tática", "Notas"]
    yy = y + 92
    for label in labels:
        draw.text((x + 44, yy), label.upper(), fill=BLACK, font=F["tiny"])
        draw.rectangle((x + 44, yy + 22, x + 194, yy + 58), fill="#ffffff", outline="#cccccc")
        yy += 78
    draw.rectangle((x + 44, y + 396, x + 194, y + 438), fill=GOLD, outline=GOLD_DARK)
    draw.text((x + 76, y + 408), "GUARDAR", fill=BLACK, font=F["tiny"])

    pitch = (x + 238, y + 42, x + 500, y + 470)
    draw.rectangle(pitch, fill="#126b38", outline="#d6f0df", width=3)
    for i in range(1, 5):
        yy = pitch[1] + i * ((pitch[3] - pitch[1]) // 5)
        draw.line((pitch[0], yy, pitch[2], yy), fill="#2d8a4d", width=18)
    draw.rectangle((pitch[0] + 28, pitch[1] + 28, pitch[2] - 28, pitch[3] - 28), outline="#d6f0df", width=2)
    for px, py, name in [
        (350, 92, "Beatriz"), (292, 185, "Clara"), (408, 185, "Inês"),
        (350, 292, "Joana"), (350, 405, "Carolina"),
    ]:
        draw.rectangle((x + px - 44, y + py - 20, x + px + 44, y + py + 24), fill=BLACK, outline=WHITE)
        draw.text((x + px - 34, y + py - 12), name, fill=WHITE, font=F["tiny"])

    draw.rectangle((x + 520, y + 42, x + 640, y + 470), fill="#ffffff", outline="#dddddd")
    draw.text((x + 536, y + 58), "ESCOLHER", fill=BLACK, font=F["tiny"])
    draw.rectangle((x + 536, y + 88, x + 624, y + 122), fill="#ffffff", outline="#cccccc")
    draw.text((x + 544, y + 97), "pesquisar", fill="#666666", font=F["small"])
    for i, name in enumerate(["Ana", "Beatriz", "Clara", "Inês", "Joana"]):
        top = y + 142 + i * 48
        draw.rectangle((x + 536, top, x + 624, top + 36), fill="#fff3f4", outline=RED)
        draw.text((x + 544, top + 8), name, fill=BLACK, font=F["tiny"])


def draw_event_mock(draw, x, y):
    draw.rectangle((x, y, x + 660, y + 460), fill=BLACK, outline=GOLD_DARK, width=2)
    draw.text((x + 28, y + 28), "CONTROLO E EVENTOS", fill=WHITE, font=F["h3"])
    buttons = ["INÍCIO DO JOGO", "FIM DA 1ª PARTE", "INÍCIO DA 2ª PARTE", "FIM DE JOGO"]
    bx = x + 28
    for label in buttons:
        draw.rectangle((bx, y + 78, bx + 138, y + 126), fill="#111111", outline=LINE)
        draw.text((bx + 12, y + 94), label[:13], fill=WHITE, font=F["tiny"])
        bx += 154
    fields = ["EVENTO", "EQUIPA", "SAI", "ENTRA"]
    bx = x + 28
    for label in fields:
        draw.text((bx, y + 158), label, fill="#666666", font=F["tiny"])
        draw.rectangle((bx, y + 184, bx + 140, y + 232), fill=WHITE)
        bx += 156
    draw.rectangle((x + 28, y + 280, x + 632, y + 334), fill=RED)
    draw.text((x + 252, y + 296), "INÍCIO DO JOGO", fill=WHITE, font=F["h3"])
    draw.rectangle((x + 28, y + 350, x + 330, y + 402), fill=WHITE)
    draw.text((x + 48, y + 366), "#2   Golo - Casa Pia", fill=GOLD_DARK, font=F["h3"])
    draw.rectangle((x + 354, y + 408, x + 632, y + 452), fill="#f4f4f4")
    draw.text((x + 394, y + 420), "Substituição - Adversário", fill=GOLD_DARK, font=F["small"])


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pages = []

    img, d = page("Guia do Delegado", "Casa Pia AC Live")
    d.text((70, 320), "Objetivo", fill=GOLD, font=F["h2"])
    text(d, (70, 370), "Este guia resume o fluxo correto para criar a ficha de jogo, projetar a tática, registar eventos e manter a Live clara para quem acompanha fora do campo.", max_width=1000)
    draw_delegate_mock(d, 870, 270)
    y = 520
    y = bullet(d, 90, y, "Usar login Delegado / 0000 para preparar e controlar a partida.")
    y = bullet(d, 90, y + 10, "Usar login Catarina / kikomiau apenas para gestão e limpeza de jogos em direto.")
    y = bullet(d, 90, y + 10, "Guardar sempre a ficha antes de começar a registar eventos.")
    y = bullet(d, 90, y + 10, "A Live mostra a ficha, fotos e eventos sem botões de apagar para o espectador.")
    pages.append(img.convert("RGB"))

    img, d = page("1. Criar Ficha de Jogo", "Escolha da partida e preparação")
    y = 300
    y = bullet(d, 90, y, "Entrar em Delegado e escolher o escalão do jogo.")
    y = bullet(d, 90, y + 8, "No campo Partida, escolher o jogo pretendido.")
    y = bullet(d, 90, y + 8, "Escrever o nome do delegado e confirmar a tática.")
    y = bullet(d, 90, y + 8, "A tática usa hífen para separar linhas. Exemplo: 1-3-4-3.")
    y = bullet(d, 90, y + 8, "Clicar em Guardar ficha quando titulares e suplentes estiverem prontos.")
    card(d, (880, 285, 1510, 760), "Boa prática", "Antes do apito inicial, confirmar se a partida, tática e banco estão corretos. A Live depende desta ficha para mostrar as jogadoras e para filtrar os eventos.")
    pages.append(img.convert("RGB"))

    img, d = page("2. Tática e Jogadoras", "Atualizado: jogadoras de todos os escalões")
    y = 295
    y = bullet(d, 90, y, "A lista de escolha já não está limitada ao escalão da partida.", max_width=720)
    y = bullet(d, 90, y + 8, "Isto permite convocar jogadoras de Sub13, Sub15, Sub17 ou Sub19 para qualquer ficha.", max_width=720)
    y = bullet(d, 90, y + 8, "Por baixo de Escolher titulares ou Escolher suplentes existe a pesquisa Pesquisar jogadora...", max_width=720)
    y = bullet(d, 90, y + 8, "Pesquisar pelo nome da jogadora ou pelo escalão para filtrar rapidamente.", max_width=720)
    y = bullet(d, 90, y + 8, "Cada cartão mostra se a jogadora está Disponível, Titular ou Suplente e indica o escalão.", max_width=720)
    draw_delegate_mock(d, 880, 265)
    pages.append(img.convert("RGB"))

    img, d = page("3. Como Projetar a Tática", "Titulares no campo e suplentes no banco")
    y = 292
    y = bullet(d, 90, y, "Selecionar o modo Titulares.")
    y = bullet(d, 90, y + 8, "Clicar numa posição vazia do campo.")
    y = bullet(d, 90, y + 8, "Usar a pesquisa para encontrar a jogadora, mesmo que seja de outro escalão.")
    y = bullet(d, 90, y + 8, "Clicar no nome: a jogadora aparece nessa posição.")
    y = bullet(d, 90, y + 8, "Alterar a tática muda a distribuição visual das linhas no campo.")
    y = bullet(d, 90, y + 8, "Selecionar Suplentes para construir o banco; estas jogadoras aparecem na ficha e nos eventos.")
    card(d, (880, 300, 1510, 770), "Efeito visual", "A projeção do Delegado e a projeção da Live usam as mesmas linhas táticas. A diferença é que na Live aparecem as fotos das jogadoras por cima do campo, quando existem no Excel.")
    pages.append(img.convert("RGB"))

    img, d = page("4. Eventos do Jogo", "Registo correto durante a partida")
    y = 295
    y = bullet(d, 90, y, "Usar os botões Início do jogo, Fim da 1ª parte, Início da 2ª parte e Fim de jogo para marcar os momentos oficiais.", max_width=720)
    y = bullet(d, 90, y + 8, "Escolher o tipo de evento: golo, substituição, canto, cartão amarelo, cartão vermelho ou falta.", max_width=720)
    y = bullet(d, 90, y + 8, "Para Casa Pia, as listas de jogadoras mostram apenas quem está na ficha guardada.", max_width=720)
    y = bullet(d, 90, y + 8, "Se a jogadora for de outro escalão mas estiver na ficha, também aparece nos eventos.", max_width=720)
    y = bullet(d, 90, y + 8, "Para a equipa adversária não é obrigatório indicar jogadora.", max_width=720)
    draw_event_mock(d, 880, 285)
    pages.append(img.convert("RGB"))

    img, d = page("5. Delegado vs Live", "O que muda para o espectador")
    card(d, (80, 290, 760, 780), "Na página Delegado", "O delegado escolhe titulares e suplentes, guarda a ficha, controla os momentos do jogo, regista eventos e pode apagar eventos deste jogo quando necessário.")
    card(d, (840, 290, 1520, 780), "Na página Live", "O espectador vê o marcador, estado do jogo, ficha com fotos, suplentes e eventos cronológicos. Não há botões de apagar para o espectador.")
    d.rectangle((80, 840, 1520, 920), fill=RED)
    d.text((500, 862), "INÍCIO DO JOGO / FIM DE JOGO aparecem como linhas vermelhas na cronologia", fill=WHITE, font=F["h3"])
    pages.append(img.convert("RGB"))

    img, d = page("6. Fecho da Partida", "Resultado final e gestão")
    y = 300
    y = bullet(d, 90, y, "Quando se clica em Fim de jogo, a Live passa a mostrar Resultado final.")
    y = bullet(d, 90, y + 8, "O jogo terminado continua visível e apresentável na Live.")
    y = bullet(d, 90, y + 8, "Só a conta Catarina consegue apagar jogos terminados da lista Live.")
    y = bullet(d, 90, y + 8, "Se for preciso corrigir dados do Excel, sincronizar ou aguardar a atualização automática configurada.")
    card(d, (880, 310, 1510, 720), "Checklist final", "1. Ficha guardada\n2. Momentos do jogo registados\n3. Eventos principais confirmados\n4. Resultado final visível\n5. Catarina limpa apenas quando já não for preciso mostrar o jogo")
    pages.append(img.convert("RGB"))

    page_files = []
    for i, pg in enumerate(pages, start=1):
        path = OUT_DIR / f"pagina_{i:02d}.png"
        pg.save(path, quality=95)
        page_files.append(path)

    pages[0].save(PDF_PATH, "PDF", save_all=True, append_images=pages[1:], resolution=140.0)
    print(PDF_PATH)


if __name__ == "__main__":
    build()
