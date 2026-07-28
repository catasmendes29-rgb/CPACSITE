import shutil
import subprocess
import time
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Documentos\New project")
ASSETS = ROOT / "public" / "assets"
OUT_DIR = ROOT / "outputs" / "guia-delegado-clean"
REAL_SHOTS = ROOT / "outputs" / "guia-delegado-real"
PDF_PATH = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Ambiente de Trabalho\CASA PIA AC\Guia_Delegado_Casa_Pia_AC_Live.pdf")
CURRENT_BACKUP = PDF_PATH.with_name("Guia_Delegado_Casa_Pia_AC_Live_backup_com_screenshots.pdf")
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
BASE_URL = "http://localhost:4173"

W, H = 1240, 1754
BLACK = "#050505"
WHITE = "#ffffff"
TEXT = "#111111"
MUTED = "#555555"
LIGHT = "#f3f3f3"
LINE = "#d8d8d8"
GOLD = "#a8872d"
RED = "#df1f2d"


def font(size, bold=False):
    candidates = [
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\calibrib.ttf" if bold else r"C:\Windows\Fonts\calibri.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


F = {
    "cover": font(62, True),
    "title": font(38, True),
    "h2": font(28, True),
    "h3": font(22, True),
    "body": font(22),
    "body_bold": font(22, True),
    "small": font(17),
    "small_bold": font(17, True),
}


def paste_fit(page, path, box):
    img = Image.open(path).convert("RGBA")
    x, y, w, h = box
    img.thumbnail((w, h), Image.LANCZOS)
    page.alpha_composite(img, (x + (w - img.width) // 2, y + (h - img.height) // 2))


def draw_text(draw, xy, value, fill=TEXT, f=None, width=900, gap=8):
    f = f or F["body"]
    x, y = xy
    chars = max(22, int(width / max(8, f.size * 0.52)))
    for paragraph in str(value).split("\n"):
        for line in wrap(paragraph, chars) or [""]:
            draw.text((x, y), line, fill=fill, font=f)
            y += f.size + gap
    return y


def bullet(draw, x, y, value, width=850):
    draw.ellipse((x, y + 10, x + 9, y + 19), fill=GOLD)
    return draw_text(draw, (x + 24, y), value, f=F["body"], width=width)


def label_text(draw, x, y, label, value, width=850):
    draw.text((x, y), label, fill=TEXT, font=F["body_bold"])
    label_w = draw.textlength(label + " ", font=F["body_bold"])
    return draw_text(draw, (x + int(label_w), y), value, f=F["body"], width=max(200, width - int(label_w)))


def page(title, subtitle=None):
    img = Image.new("RGBA", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 128), fill=BLACK)
    paste_fit(img, ASSETS / "logo.png", (48, 25, 76, 76))
    d.text((142, 34), "CASA PIA AC", fill=WHITE, font=F["h3"])
    d.text((142, 68), "Futebol Feminino - Live", fill=GOLD, font=F["small_bold"])
    paste_fit(img, ASSETS / "goldganso.png", (1110, 28, 70, 70))
    d.rectangle((0, 128, W, 134), fill=GOLD)
    d.text((70, 180), title, fill=TEXT, font=F["title"])
    if subtitle:
        d.text((70, 226), subtitle, fill=GOLD, font=F["h3"])
    return img, d


def image_box(page, draw, path, x, y, w, h, caption=None):
    draw.rectangle((x, y, x + w, y + h), fill=LIGHT, outline=LINE, width=2)
    paste_fit(page, path, (x + 16, y + 16, w - 32, h - 48 if caption else h - 32))
    if caption:
        draw.rectangle((x, y + h - 34, x + w, y + h), fill=BLACK)
        draw.text((x + 16, y + h - 27), caption, fill=WHITE, font=F["small_bold"])


def ensure_real_screenshots():
    needed = {
        "resultados": REAL_SHOTS / "01_resultados.png",
        "delegado": REAL_SHOTS / "02_delegado_ficha.png",
        "pesquisa": REAL_SHOTS / "03_pesquisa_jogadoras.png",
        "eventos": REAL_SHOTS / "04_eventos_delegado.png",
        "live": REAL_SHOTS / "05_live.png",
    }
    if all(path.exists() for path in needed.values()):
        return needed
    script = ROOT / "scripts" / "criar_guia_delegado_real.py"
    subprocess.run(["python", str(script)], check=True, timeout=120)
    return needed


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shots = ensure_real_screenshots()

    if PDF_PATH.exists() and not CURRENT_BACKUP.exists():
        shutil.copy2(PDF_PATH, CURRENT_BACKUP)

    pages = []

    img, d = page("Guia do Delegado", "Casa Pia AC Live")
    d.text((70, 340), "Objetivo", fill=TEXT, font=F["h2"])
    y = draw_text(d, (70, 382), "Este guia mostra, por etapas, o que o delegado deve fazer antes do jogo, durante a Live e no fim da partida.", width=1000)
    y += 30
    y = label_text(d, 70, y, "1. Antes do jogo:", "entrar como Delegado, escolher a partida e guardar a ficha.", 1000)
    y = label_text(d, 70, y + 12, "2. Durante o jogo:", "controlar o estado da Live e registar eventos.", 1000)
    y = label_text(d, 70, y + 12, "3. Fim do jogo:", "fechar a Live com o resultado final visível.", 1000)
    y = label_text(d, 70, y + 12, "Acesso:", "ID Delegado e palavra-passe 0000.", 1000)
    image_box(img, d, shots["resultados"], 105, 810, 1030, 610, "Ecrã inicial da aplicação")
    pages.append(img.convert("RGB"))

    img, d = page("1. Antes do Jogo", "Entrar e escolher a partida")
    y = 320
    y = label_text(d, 90, y, "Passo 1:", "abrir a aplicação e clicar em Delegado.", 980)
    y = label_text(d, 90, y + 14, "Passo 2:", "fazer login com ID Delegado e palavra-passe 0000.", 980)
    y = label_text(d, 90, y + 14, "Passo 3:", "no painel Jogo, escolher o escalão da partida.", 980)
    y = label_text(d, 90, y + 14, "Passo 4:", "escolher a partida correta no campo Partida.", 980)
    y = label_text(d, 90, y + 14, "Passo 5:", "confirmar o nome do delegado e preparar a tática.", 980)
    image_box(img, d, shots["delegado"], 105, 620, 1030, 900, "Ficha do delegado")
    pages.append(img.convert("RGB"))

    img, d = page("2. Antes do Jogo", "Definir a tática")
    y = 310
    y = label_text(d, 90, y, "Passo 1:", "escrever a tática com números separados por hífen, por exemplo 1-3-4-3.", 980)
    y = label_text(d, 90, y + 14, "Passo 2:", "confirmar se o campo mudou para as linhas pretendidas.", 980)
    y = label_text(d, 90, y + 14, "Passo 3:", "clicar numa posição vazia do campo para escolher quem entra nesse lugar.", 980)
    y = label_text(d, 90, y + 14, "Nota:", "a Live usa esta mesma disposição, mas com fotos das jogadoras quando existirem.", 980)
    image_box(img, d, shots["delegado"], 140, 610, 960, 880, "Campo tático e lista de escolha")
    pages.append(img.convert("RGB"))

    img, d = page("3. Antes do Jogo", "Escolher titulares e suplentes")
    y = 310
    y = label_text(d, 90, y, "Passo 1:", "clicar em Titulares.", 980)
    y = label_text(d, 90, y + 14, "Passo 2:", "clicar numa posição do campo.", 980)
    y = label_text(d, 90, y + 14, "Passo 3:", "usar a barra Pesquisar jogadora... para encontrar a jogadora.", 980)
    y = label_text(d, 90, y + 14, "Passo 4:", "clicar no cartão da jogadora para a colocar em campo.", 980)
    y = label_text(d, 90, y + 14, "Passo 5:", "clicar em Suplentes e escolher o banco.", 980)
    y = label_text(d, 90, y + 14, "Importante:", "a pesquisa mostra jogadoras de todos os escalões. Cada cartão indica o escalão de origem.", 980)
    image_box(img, d, shots["pesquisa"], 250, 710, 740, 760, "Pesquisa real na lista de jogadoras")
    pages.append(img.convert("RGB"))

    img, d = page("4. Antes do Jogo", "Guardar a ficha")
    y = 310
    y = label_text(d, 90, y, "Passo 1:", "confirmar se o contador de titulares está completo.", 980)
    y = label_text(d, 90, y + 14, "Passo 2:", "verificar se o banco tem as suplentes corretas.", 980)
    y = label_text(d, 90, y + 14, "Passo 3:", "confirmar se a tática e a disposição no campo estão certas.", 980)
    y = label_text(d, 90, y + 14, "Passo 4:", "clicar em Guardar ficha.", 980)
    y = label_text(d, 90, y + 14, "Passo 5:", "só depois de guardar a ficha se deve iniciar o jogo na Live.", 980)
    y = label_text(d, 90, y + 14, "Nota:", "os eventos do Casa Pia só deixam escolher jogadoras que estão nesta ficha guardada.", 980)
    image_box(img, d, shots["delegado"], 115, 720, 1010, 760, "Titulares, suplentes e botão Guardar ficha")
    pages.append(img.convert("RGB"))

    img, d = page("5. Durante o Jogo", "Controlar a Live")
    y = 310
    y = label_text(d, 90, y, "Início:", "clicar em Início do jogo quando a partida começa.", 980)
    y = label_text(d, 90, y + 14, "Intervalo:", "clicar em Fim da 1ª parte no apito para intervalo.", 980)
    y = label_text(d, 90, y + 14, "Recomeço:", "clicar em Início da 2ª parte quando a segunda parte começa.", 980)
    y = label_text(d, 90, y + 14, "Durante:", "registar golos, substituições, cantos, cartões e faltas.", 980)
    y = label_text(d, 90, y + 14, "Correções:", "se houver erro, apagar o evento na zona Eventos deste jogo.", 980)
    image_box(img, d, shots["eventos"], 105, 720, 1030, 680, "Controlo de eventos")
    pages.append(img.convert("RGB"))

    img, d = page("6. Durante o Jogo", "Registar eventos")
    y = 310
    y = label_text(d, 90, y, "Golo:", "escolher equipa, jogadora do Casa Pia se aplicável e assistência se existir.", 980)
    y = label_text(d, 90, y + 14, "Substituição:", "escolher quem sai e quem entra.", 980)
    y = label_text(d, 90, y + 14, "Canto/falta/cartão:", "escolher equipa; para Casa Pia, indicar jogadora quando o formulário pedir.", 980)
    y = label_text(d, 90, y + 14, "Adversário:", "não é obrigatório indicar jogadora.", 980)
    y = label_text(d, 90, y + 14, "Live:", "cada evento registado aparece automaticamente na cronologia do espectador.", 980)
    image_box(img, d, shots["live"], 105, 690, 1030, 720, "Página Live")
    pages.append(img.convert("RGB"))

    img, d = page("7. Fim do Jogo", "Fechar a partida em Live")
    y = 330
    y = label_text(d, 110, y, "Passo 1:", "confirmar se o marcador está correto.", 1000)
    y = label_text(d, 110, y + 18, "Passo 2:", "registar qualquer evento em falta.", 1000)
    y = label_text(d, 110, y + 18, "Passo 3:", "clicar em Fim de jogo.", 1000)
    y = label_text(d, 110, y + 18, "Passo 4:", "abrir a página Live e confirmar que aparece Resultado final.", 1000)
    y = label_text(d, 110, y + 18, "Passo 5:", "deixar o jogo visível até ser removido pela gestão da plataforma.", 1000)
    d.rectangle((105, 805, 1135, 945), fill=LIGHT, outline=GOLD, width=3)
    d.text((145, 845), "Nota importante", fill=TEXT, font=F["h2"])
    draw_text(d, (145, 890), "As jogadoras podem ser escolhidas de qualquer escalão na ficha. Depois de guardar, os eventos do Casa Pia ficam limitados às jogadoras presentes nessa ficha.", f=F["body_bold"], width=930)
    pages.append(img.convert("RGB"))

    for i, pg in enumerate(pages, start=1):
        pg.save(OUT_DIR / f"clean_pagina_{i:02d}.png", quality=95)

    pages[0].save(PDF_PATH, "PDF", save_all=True, append_images=pages[1:], resolution=150.0)
    print(PDF_PATH)
    print(CURRENT_BACKUP)


if __name__ == "__main__":
    build()
