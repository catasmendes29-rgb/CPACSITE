import base64
import json
import shutil
import subprocess
import time
from pathlib import Path
from textwrap import wrap

import requests
import websocket
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Documentos\New project")
ASSETS = ROOT / "public" / "assets"
OUT_DIR = ROOT / "outputs" / "guia-delegado-real"
PDF_PATH = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Ambiente de Trabalho\CASA PIA AC\Guia_Delegado_Casa_Pia_AC_Live.pdf")
BACKUP_PATH = PDF_PATH.with_name("Guia_Delegado_Casa_Pia_AC_Live_backup_antigo.pdf")
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
BASE_URL = "http://localhost:4173"

PAGE_W, PAGE_H = 1600, 1100
BLACK = "#050505"
PANEL = "#111111"
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
    for item in candidates:
        if Path(item).exists():
            return ImageFont.truetype(item, size)
    return ImageFont.load_default()


F = {
    "title": font(68, True),
    "h1": font(44, True),
    "h2": font(30, True),
    "h3": font(23, True),
    "body": font(23),
    "small": font(18),
    "tiny": font(15, True),
}


class CDP:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=60)
        self.next_id = 0

    def call(self, method, params=None):
        self.next_id += 1
        self.ws.send(json.dumps({"id": self.next_id, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.next_id:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg.get("result", {})


def start_chrome():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    profile = OUT_DIR / f"chrome-profile-{int(time.time())}"
    profile.mkdir(parents=True, exist_ok=True)
    port = 9234
    args = [
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        f"--remote-debugging-port={port}",
        "--remote-allow-origins=*",
        f"--user-data-dir={profile}",
        "about:blank",
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        try:
            tabs = requests.get(f"http://127.0.0.1:{port}/json", timeout=1).json()
            if tabs:
                return proc, tabs[0]["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.25)
    proc.terminate()
    raise RuntimeError("Chrome CDP não arrancou.")


def wait_ready(cdp, delay=1.2):
    cdp.call("Runtime.evaluate", {"expression": "document.readyState", "returnByValue": True})
    time.sleep(delay)


def evaluate(cdp, expression):
    return cdp.call("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True})


def screenshot(cdp, name, selector=None):
    if selector:
        expression = f"""
        (() => {{
          const el = document.querySelector({json.dumps(selector)});
          if (!el) return null;
          el.scrollIntoView({{block:'start', inline:'nearest'}});
          const r = el.getBoundingClientRect();
          return {{x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: Math.min(window.innerWidth, r.width + 24), height: Math.min(window.innerHeight, r.height + 24)}};
        }})()
        """
        result = evaluate(cdp, expression).get("result", {}).get("value")
        time.sleep(0.45)
        if result and result["width"] > 0 and result["height"] > 0:
            clip = {
                "x": float(result["x"]),
                "y": float(result["y"]),
                "width": float(result["width"]),
                "height": float(result["height"]),
                "scale": 1,
            }
            shot = cdp.call("Page.captureScreenshot", {"format": "png", "fromSurface": True, "captureBeyondViewport": False, "clip": clip})["data"]
        else:
            shot = cdp.call("Page.captureScreenshot", {"format": "png", "fromSurface": True, "captureBeyondViewport": False})["data"]
    else:
        shot = cdp.call("Page.captureScreenshot", {"format": "png", "fromSurface": True})["data"]
    path = OUT_DIR / f"{name}.png"
    path.write_bytes(base64.b64decode(shot))
    return path


def take_real_screenshots():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    profile = OUT_DIR / f"chrome-cli-profile-{int(time.time())}"
    profile.mkdir(parents=True, exist_ok=True)
    login_page = ROOT / "public" / "_guide_login.html"
    login_page.write_text(
        """<!doctype html><meta charset="utf-8"><title>Guia</title>
<script>
localStorage.setItem('cpacUser', JSON.stringify({id:'Delegado', name:'Delegado', role:'delegate'}));
setTimeout(() => { location.href = '/#delegado'; }, 250);
</script>
<body style="background:#050505;color:white;font-family:Arial;padding:40px">A preparar sessão de delegado...</body>""",
        encoding="utf-8",
    )

    def run(url, name, width=1440, height=1200, budget=4500):
        path = OUT_DIR / f"{name}.png"
        cmd = [
            str(CHROME),
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            f"--window-size={width},{height}",
            f"--virtual-time-budget={budget}",
            f"--screenshot={path}",
            url,
        ]
        subprocess.run(cmd, check=True, timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return path

    run(f"{BASE_URL}/_guide_login.html", "00_login", 1440, 1200, 5000)
    resultados = run(f"{BASE_URL}/#resultados", "01_resultados", 1440, 1300)
    delegado_full = run(f"{BASE_URL}/#delegado", "02_delegado_full", 1440, 2200)
    live = run(f"{BASE_URL}/#live", "05_live", 1440, 1300)

    full = Image.open(delegado_full).convert("RGB")
    delegado = OUT_DIR / "02_delegado_ficha.png"
    pesquisa = OUT_DIR / "03_pesquisa_jogadoras.png"
    eventos = OUT_DIR / "04_eventos_delegado.png"
    full.crop((0, 0, min(1440, full.width), min(1180, full.height))).save(delegado)
    full.crop((900, 180, min(1440, full.width), min(1180, full.height))).save(pesquisa)
    full.crop((0, 1000, min(1440, full.width), min(2100, full.height))).save(eventos)

    return {
        "resultados": resultados,
        "delegado": delegado,
        "pesquisa": pesquisa,
        "eventos": eventos,
        "live": live,
    }


def paste_fit(base, image_path, box):
    img = Image.open(image_path).convert("RGBA")
    x, y, w, h = box
    img.thumbnail((w, h), Image.LANCZOS)
    px = x + (w - img.width) // 2
    py = y + (h - img.height) // 2
    base.alpha_composite(img, (px, py))


def draw_wrapped(draw, xy, value, fill=WHITE, f=None, max_width=760, gap=8):
    f = f or F["body"]
    x, y = xy
    chars = max(20, int(max_width / max(8, f.size * 0.52)))
    for paragraph in str(value).split("\n"):
        for line in wrap(paragraph, chars) or [""]:
            draw.text((x, y), line, fill=fill, font=f)
            y += f.size + gap
    return y


def bullet(draw, x, y, value, max_width=730):
    draw.rectangle((x, y + 10, x + 10, y + 20), fill=GOLD)
    return draw_wrapped(draw, (x + 24, y), value, f=F["body"], max_width=max_width)


def new_page(title, subtitle=None):
    page = Image.new("RGBA", (PAGE_W, PAGE_H), BLACK)
    draw = ImageDraw.Draw(page)
    draw.rectangle((0, 0, PAGE_W, 118), fill=BLACK)
    draw.line((0, 118, PAGE_W, 118), fill=GOLD_DARK, width=3)
    paste_fit(page, ASSETS / "logo.png", (36, 20, 78, 78))
    draw.text((132, 30), "CASA PIA AC", fill=WHITE, font=F["h3"])
    draw.text((132, 62), "FUTEBOL FEMININO - LIVE", fill=GOLD, font=F["small"])
    paste_fit(page, ASSETS / "goldganso.png", (1460, 18, 76, 76))
    draw.text((70, 166), title, fill=WHITE, font=F["h1"])
    if subtitle:
        draw.text((70, 218), subtitle, fill=GOLD, font=F["h3"])
    return page, draw


def image_card(page, draw, image_path, box, title=None):
    x, y, w, h = box
    draw.rectangle((x, y, x + w, y + h), fill="#f4f4f4", outline=GOLD_DARK, width=2)
    if title:
        draw.rectangle((x, y, x + w, y + 46), fill=GOLD_DARK)
        draw.text((x + 18, y + 12), title, fill=BLACK, font=F["small"])
        img_box = (x + 16, y + 62, w - 32, h - 78)
    else:
        img_box = (x + 16, y + 16, w - 32, h - 32)
    paste_fit(page, image_path, img_box)


def build_pdf(shots):
    if PDF_PATH.exists() and not BACKUP_PATH.exists():
        shutil.copy2(PDF_PATH, BACKUP_PATH)

    pages = []

    page, draw = new_page("Guia do Delegado", "Passo a passo para preparar e acompanhar jogos")
    draw_wrapped(draw, (80, 315), "Este guia foi atualizado com screenshots reais da app Casa Pia AC Live e com a nova regra da ficha de jogo: o delegado pode escolher jogadoras de qualquer escalão.", f=F["body"], max_width=880)
    y = 455
    y = bullet(draw, 90, y, "Entrar com ID Delegado e palavra-passe 0000.")
    y = bullet(draw, 90, y + 10, "Escolher partida, tática, titulares e suplentes antes do início.")
    y = bullet(draw, 90, y + 10, "Registar momentos oficiais e eventos durante o jogo.")
    y = bullet(draw, 90, y + 10, "Confirmar a Live para garantir que a ficha e a cronologia aparecem corretamente.")
    image_card(page, draw, shots["resultados"], (960, 300, 520, 430), "Ecrã inicial da app")
    pages.append(page.convert("RGB"))

    page, draw = new_page("1. Entrada e Partida", "O que preencher primeiro")
    y = 300
    y = bullet(draw, 80, y, "Abrir a página Delegado no menu superior.", 700)
    y = bullet(draw, 80, y + 8, "Escolher o escalão da partida no painel Jogo.", 700)
    y = bullet(draw, 80, y + 8, "Selecionar a partida disponível.", 700)
    y = bullet(draw, 80, y + 8, "Preencher o nome do delegado e confirmar a tática.", 700)
    y = bullet(draw, 80, y + 8, "Usar Guardar ficha quando a convocatória estiver completa.", 700)
    image_card(page, draw, shots["delegado"], (840, 255, 680, 650), "Ficha real do delegado")
    pages.append(page.convert("RGB"))

    page, draw = new_page("2. Tática", "Como a formação projeta o campo")
    y = 292
    y = bullet(draw, 80, y, "A tática é escrita com números separados por hífen: por exemplo 1-3-4-3.", 760)
    y = bullet(draw, 80, y + 8, "Cada número representa uma linha no campo.", 760)
    y = bullet(draw, 80, y + 8, "Ao clicar numa posição do campo, a próxima jogadora escolhida entra nessa posição.", 760)
    y = bullet(draw, 80, y + 8, "Se alterares a tática, a disposição visual reorganiza as linhas.", 760)
    y = bullet(draw, 80, y + 8, "Na Live, a disposição deve ser igual, com a adição das fotos das jogadoras quando existirem.", 760)
    image_card(page, draw, shots["delegado"], (900, 285, 560, 560), "Campo tático na app")
    pages.append(page.convert("RGB"))

    page, draw = new_page("3. Escolher Jogadoras", "Nova regra: todos os escalões disponíveis")
    y = 295
    y = bullet(draw, 80, y, "A lista de jogadoras já não está limitada ao escalão da partida.", 740)
    y = bullet(draw, 80, y + 8, "Isto permite convocar uma jogadora de Sub13, Sub15, Sub17 ou Sub19 para outro escalão.", 740)
    y = bullet(draw, 80, y + 8, "Debaixo de Escolher titulares ou Escolher suplentes existe a barra Pesquisar jogadora...", 740)
    y = bullet(draw, 80, y + 8, "Pesquisar pelo nome ou pelo escalão ajuda a encontrar rapidamente a jogadora.", 740)
    y = bullet(draw, 80, y + 8, "Cada cartão indica o estado da jogadora e o escalão de origem.", 740)
    image_card(page, draw, shots["pesquisa"], (900, 285, 560, 560), "Pesquisa real de jogadoras")
    pages.append(page.convert("RGB"))

    page, draw = new_page("4. Titulares e Suplentes", "Sequência recomendada")
    y = 292
    y = bullet(draw, 80, y, "Selecionar Titulares.", 760)
    y = bullet(draw, 80, y + 8, "Clicar numa posição do campo.", 760)
    y = bullet(draw, 80, y + 8, "Pesquisar e clicar na jogadora pretendida.", 760)
    y = bullet(draw, 80, y + 8, "Repetir até completar o número de titulares do formato do escalão.", 760)
    y = bullet(draw, 80, y + 8, "Selecionar Suplentes e escolher o banco.", 760)
    y = bullet(draw, 80, y + 8, "Clicar em Guardar ficha no final.", 760)
    image_card(page, draw, shots["delegado"], (880, 280, 600, 590), "Titulares, banco e pesquisa")
    pages.append(page.convert("RGB"))

    page, draw = new_page("5. Eventos", "O que registar durante o jogo")
    y = 292
    y = bullet(draw, 80, y, "Usar os botões Início do jogo, Fim da 1ª parte, Início da 2ª parte e Fim de jogo.", 760)
    y = bullet(draw, 80, y + 8, "Registar golo, substituição, canto, cartão amarelo, cartão vermelho ou falta.", 760)
    y = bullet(draw, 80, y + 8, "Nos eventos do Casa Pia, as listas mostram apenas jogadoras guardadas na ficha.", 760)
    y = bullet(draw, 80, y + 8, "Se uma jogadora de outro escalão estiver na ficha, aparece também nos eventos.", 760)
    y = bullet(draw, 80, y + 8, "Para adversário não é necessário indicar jogadora.", 760)
    image_card(page, draw, shots["eventos"], (890, 285, 610, 570), "Controlo de eventos real")
    pages.append(page.convert("RGB"))

    page, draw = new_page("6. O que aparece na Live", "Visão do espectador")
    y = 300
    y = bullet(draw, 80, y, "A Live mostra o resultado, estado do jogo, ficha de jogo e cronologia.", 780)
    y = bullet(draw, 80, y + 8, "A ficha da Live usa a mesma tática guardada pelo delegado.", 780)
    y = bullet(draw, 80, y + 8, "Os eventos aparecem em ordem cronológica.", 780)
    y = bullet(draw, 80, y + 8, "A Live não tem botões de apagar eventos.", 780)
    y = bullet(draw, 80, y + 8, "Quando o jogo termina, o resultado final fica apresentável na página Live.", 780)
    image_card(page, draw, shots["live"], (870, 275, 650, 600), "Página Live real")
    pages.append(page.convert("RGB"))

    page, draw = new_page("7. Checklist Final", "Antes, durante e depois")
    y = 310
    y = bullet(draw, 120, y, "Antes: partida correta, tática definida, titulares e suplentes escolhidas.", 1200)
    y = bullet(draw, 120, y + 20, "Durante: marcar início/fim de partes e registar eventos relevantes.", 1200)
    y = bullet(draw, 120, y + 20, "Após o jogo: clicar em Fim de jogo e confirmar o resultado final na Live.", 1200)
    y = bullet(draw, 120, y + 20, "Se precisares corrigir a ficha, volta ao Delegado, ajusta e guarda novamente.", 1200)
    draw.rectangle((120, 750, 1480, 840), fill=RED)
    draw.text((470, 780), "Regra-chave: eventos do Casa Pia usam apenas jogadoras da ficha guardada.", fill=WHITE, font=F["h3"])
    pages.append(page.convert("RGB"))

    for i, pg in enumerate(pages, start=1):
        pg.save(OUT_DIR / f"guia_pagina_{i:02d}.png", quality=95)
    pages[0].save(PDF_PATH, "PDF", save_all=True, append_images=pages[1:], resolution=140.0)
    print(PDF_PATH)
    print(BACKUP_PATH)


def main():
    shots = take_real_screenshots()
    build_pdf(shots)


if __name__ == "__main__":
    main()
