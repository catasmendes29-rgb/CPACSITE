import shutil
import subprocess
import time
import json
from pathlib import Path
from textwrap import wrap

import requests
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Documentos\New project")
ASSETS = ROOT / "public" / "assets"
REAL_SHOTS = ROOT / "outputs" / "guia-delegado-real"
OUT_DIR = ROOT / "outputs" / "guia-delegado-compacto"
DEMO_DIR = ROOT / "outputs" / "guia-demo-live"
PDF_PATH = Path(r"C:\Users\catas\OneDrive - Universidade do Algarve\Ambiente de Trabalho\CASA PIA AC\Guia_Delegado_Casa_Pia_AC_Live.pdf")
BACKUP_PATH = PDF_PATH.with_name("Guia_Delegado_Casa_Pia_AC_Live_backup_clean_etapas.pdf")
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")

W, H = 1240, 1754
BLACK = "#050505"
WHITE = "#ffffff"
TEXT = "#151515"
MUTED = "#555555"
LIGHT = "#f5f0df"
BOX = "#f1f1f1"
LINE = "#d7d7d7"
GOLD = "#947327"
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
    "title": font(34, True),
    "subtitle": font(20, True),
    "section": font(22, True),
    "body": font(21),
    "body_bold": font(21, True),
    "small": font(15),
    "small_bold": font(15, True),
}


class Page:
    def __init__(self, number):
        self.img = Image.new("RGBA", (W, H), WHITE)
        self.draw = ImageDraw.Draw(self.img)
        self.number = number
        self.y = 150
        self._header()

    def _header(self):
        d = self.draw
        d.rectangle((0, 0, W, 110), fill=BLACK)
        self.paste_fit(ASSETS / "logo.png", (44, 18, 70, 70))
        d.text((132, 28), "GUIA DO DELEGADO", fill=WHITE, font=F["title"])
        d.text((132, 66), "Casa Pia AC Live", fill=GOLD, font=F["subtitle"])
        self.paste_fit(ASSETS / "goldganso.png", (1110, 22, 64, 64))
        d.rectangle((0, 110, W, 116), fill=GOLD)

    def footer(self, total=None):
        d = self.draw
        d.line((70, H - 70, W - 70, H - 70), fill=LINE, width=1)
        d.text((70, H - 48), "Guia do Delegado - Casa Pia AC Live", fill=MUTED, font=F["small"])
        suffix = f"{self.number}/{total}" if total else str(self.number)
        d.text((W - 120, H - 48), suffix, fill=MUTED, font=F["small"])

    def paste_fit(self, path, box):
        img = Image.open(path).convert("RGBA")
        x, y, w, h = box
        img.thumbnail((w, h), Image.LANCZOS)
        self.img.alpha_composite(img, (x + (w - img.width) // 2, y + (h - img.height) // 2))

    def title(self, title, subtitle=None):
        self.draw.text((70, self.y), title, fill=TEXT, font=F["title"])
        self.y += 42
        if subtitle:
            self.draw.text((70, self.y), subtitle, fill=GOLD, font=F["subtitle"])
            self.y += 42
        else:
            self.y += 22

    def section(self, title):
        self.y += 16
        self.draw.text((70, self.y), title.upper(), fill=GOLD, font=F["section"])
        self.y += 38

    def paragraph(self, text, x=70, width=1030, f=None, fill=TEXT):
        f = f or F["body"]
        chars = max(20, int(width / max(8, f.size * 0.52)))
        for line in wrap(text, chars):
            self.draw.text((x, self.y), line, fill=fill, font=f)
            self.y += f.size + 8
        self.y += 4

    def numbered(self, items, x=92, width=1000):
        for i, item in enumerate(items, start=1):
            self.rich_line(f"{i}. ", item, x, width)
            self.y += 8

    def bullets(self, items, x=92, width=1000):
        for item in items:
            self.draw.ellipse((x, self.y + 10, x + 7, self.y + 17), fill=TEXT)
            self.rich_line("", item, x + 22, width - 22)
            self.y += 8

    def rich_line(self, prefix, parts, x=92, width=1000):
        if isinstance(parts, str):
            parts = [(parts, False)]
        tokens = []
        if prefix:
            tokens.append((prefix, False))
        for text, bold in parts:
            tokens.extend(self._split_rich(text, bold))

        cur_x, cur_y = x, self.y
        right = x + width
        line_height = F["body"].size + 8
        for token, bold in tokens:
            f = F["body_bold"] if bold else F["body"]
            token_w = self.draw.textlength(token, font=f)
            if cur_x + token_w > right and cur_x > x:
                cur_x = x
                cur_y += line_height
            self.draw.text((cur_x, cur_y), token, fill=TEXT, font=f)
            cur_x += token_w
        self.y = cur_y + line_height

    def _split_rich(self, text, bold):
        words = str(text).split(" ")
        result = []
        for i, word in enumerate(words):
            result.append((word + (" " if i < len(words) - 1 else ""), bold))
        return result

    def note(self, text):
        self.y += 8
        top = self.y
        lines = wrap(text, 68)
        height = 34 + len(lines) * 28
        self.draw.rectangle((70, top, W - 70, top + height), fill=LIGHT)
        self.draw.rectangle((70, top, 78, top + height), fill=GOLD)
        y = top + 18
        for line in lines:
            self.draw.text((100, y), line, fill=TEXT, font=F["body_bold"])
            y += 28
        self.y = top + height + 22

    def image(self, path, caption=None, w=980, h=560):
        x = (W - w) // 2
        y = self.y + 10
        self.draw.rectangle((x, y, x + w, y + h), fill=BOX, outline=LINE, width=2)
        img_h = h - 42 if caption else h - 24
        self.paste_fit(path, (x + 12, y + 12, w - 24, img_h))
        if caption:
            self.draw.rectangle((x, y + h - 34, x + w, y + h), fill=BLACK)
            self.draw.text((x + 18, y + h - 27), caption, fill=WHITE, font=F["small_bold"])
        self.y = y + h + 22


def ensure_shots():
    needed = {
        "delegado": REAL_SHOTS / "02_delegado_ficha.png",
        "pesquisa": REAL_SHOTS / "03_pesquisa_jogadoras.png",
        "eventos": REAL_SHOTS / "04_eventos_delegado.png",
        "live": REAL_SHOTS / "05_live.png",
    }
    if all(path.exists() for path in needed.values()):
        return needed
    subprocess.run(["python", str(ROOT / "scripts" / "criar_guia_delegado_real.py")], check=True, timeout=120)
    return needed


def post_json(url, payload):
    response = requests.post(url, json=payload, timeout=10)
    response.raise_for_status()
    return response.json()


def chrome_screenshot(url, out_path, width=1440, height=1500, budget=4500, profile=None):
    if profile is None:
        profile = DEMO_DIR / f"chrome-profile-{int(time.time() * 1000)}"
        profile.mkdir(parents=True, exist_ok=True)
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
        f"--screenshot={out_path}",
        url,
    ]
    subprocess.run(cmd, check=True, timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def create_demo_screenshots():
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = DEMO_DIR / "data"
    if data_dir.exists():
        shutil.rmtree(data_dir)
    data_dir.mkdir(parents=True)
    shutil.copy2(ROOT / "data" / "db.json", data_dir / "db.json")

    port = 4188
    env = dict(**__import__("os").environ)
    env["PORT"] = str(port)
    env["DATA_DIR"] = str(data_dir)
    proc = subprocess.Popen(
        ["node", "server.js"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        base = f"http://localhost:{port}"
        for _ in range(60):
            try:
                db = requests.get(f"{base}/api/bootstrap", timeout=1).json()
                break
            except Exception:
                time.sleep(0.25)
        else:
            raise RuntimeError("Servidor temporário não arrancou.")

        default_level = db["teams"][0]["level"] if db.get("teams") else "Sub13"
        match = next(
            (
                m
                for m in db["matches"]
                if m.get("level") == default_level and (m.get("status") == "scheduled" or m.get("goalsFor") is None or m.get("goalsAgainst") is None)
            ),
            next((m for m in db["matches"] if m.get("status") == "scheduled"), db["matches"][0]),
        )
        players = sorted(db["players"], key=lambda p: p["name"])
        starters = [p["name"] for p in players[: min(11, len(players))]]
        bench = [p["name"] for p in players[11:17]]
        tactic = "1-3-4-3" if len(starters) >= 11 else "1-2-3-1"

        post_json(f"{base}/api/report", {
            "matchId": match["id"],
            "delegate": "Delegado",
            "tactic": tactic,
            "starters": starters,
            "bench": bench,
            "lineupSlots": starters,
            "notes": "Ficha de demonstração para o guia.",
        })
        post_json(f"{base}/api/live", {
            "matchId": match["id"],
            "status": "Em direto",
            "period": "1ª Parte",
            "homeScore": 0,
            "awayScore": 0,
            "cornersFor": 0,
            "cornersAgainst": 0,
            "liveEnded": False,
        })

        demo_events = [
            {"type": "Início do jogo", "period": "Sistema", "team": "Sistema"},
            {"type": "Golo", "period": "1ª Parte", "team": "Casa Pia", "playerName": starters[1] if len(starters) > 1 else starters[0], "assistName": starters[2] if len(starters) > 2 else ""},
            {"type": "Substituição", "period": "1ª Parte", "team": "Casa Pia", "outPlayerName": starters[3] if len(starters) > 3 else starters[0], "inPlayerName": bench[0] if bench else starters[-1]},
            {"type": "Canto", "period": "1ª Parte", "team": "Adversário"},
            {"type": "Falta", "period": "1ª Parte", "team": "Casa Pia", "playerName": starters[4] if len(starters) > 4 else starters[0]},
        ]
        for event in demo_events:
            post_json(f"{base}/api/events", {"matchId": match["id"], **event})

        login_page = ROOT / "public" / "_guide_demo_login.html"
        login_page.write_text(
            """<!doctype html><meta charset="utf-8"><script>
localStorage.setItem('cpacUser', JSON.stringify({id:'Delegado', name:'Delegado', role:'delegate'}));
setTimeout(() => { location.href = '/#delegado'; }, 250);
</script>""",
            encoding="utf-8",
        )
        profile = DEMO_DIR / f"chrome-demo-profile-{int(time.time() * 1000)}"
        profile.mkdir(parents=True, exist_ok=True)
        chrome_screenshot(f"{base}/_guide_demo_login.html", DEMO_DIR / "00_login.png", 1440, 1400, 5000, profile)
        chrome_screenshot(f"{base}/#delegado", DEMO_DIR / "delegate_events_full.png", 1440, 2300, 5000, profile)
        chrome_screenshot(f"{base}/#live/{match['id']}", DEMO_DIR / "live_events_full.png", 1440, 2300, 5000, profile)
        login_page.unlink(missing_ok=True)

        # Crop the delegate screenshot to focus on the event controls, and the live screenshot
        # to show the scoreboard, events and tactical ficha in one page.
        delegate_full = Image.open(DEMO_DIR / "delegate_events_full.png").convert("RGB")
        live_full = Image.open(DEMO_DIR / "live_events_full.png").convert("RGB")
        delegate_full.crop((0, 980, min(1440, delegate_full.width), min(2100, delegate_full.height))).save(DEMO_DIR / "delegate_events_example.png")
        live_full.crop((0, 0, min(1440, live_full.width), min(2050, live_full.height))).save(DEMO_DIR / "live_events_tactic_example.png")
        return {
            "delegate_events": DEMO_DIR / "delegate_events_example.png",
            "live_events_tactic": DEMO_DIR / "live_events_tactic_example.png",
        }
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shots = ensure_shots()
    demo = create_demo_screenshots()

    if PDF_PATH.exists() and not BACKUP_PATH.exists():
        shutil.copy2(PDF_PATH, BACKUP_PATH)

    pages = []

    p = Page(1)
    p.title("Guia rápido do delegado", "Etapas antes, durante e depois da Live")
    p.section("Antes do jogo")
    p.numbered([
        [("Entrar na página ", False), ("Delegado", True), (" com ID ", False), ("Delegado", True), (" e palavra-passe ", False), ("0000", True), (" .", False)],
        [("No painel ", False), ("Jogo", True), (", escolher o ", False), ("Escalão", True), (" e a ", False), ("Partida", True), (" correta.", False)],
        [("Preencher o campo ", False), ("Delegado", True), (" se necessário.", False)],
        [("No campo ", False), ("Tática", True), (", escrever a estrutura. Exemplo: ", False), ("1-3-4-3", True), (" .", False)],
    ])
    p.section("Adicionar titulares")
    p.numbered([
        [("Clicar no botão ", False), ("Titulares", True), (" .", False)],
        [("Clicar num botão do campo, na posição onde a jogadora deve ficar.", False)],
        [("Na lista da direita, usar ", False), ("Pesquisar jogadora...", True), (" para encontrar o nome.", False)],
        [("Escolher a jogadora e repetir até preencher todas as titulares.", False)],
    ])
    p.note("A lista permite escolher jogadoras de todos os escalões. O cartão mostra o escalão de origem para evitar confusões.")
    p.image(shots["delegado"], "Ficha do delegado: jogo, tática, campo e lista de jogadoras", 990, 575)
    pages.append(p)

    p = Page(2)
    p.title("Ficha de jogo", "Titulares, suplentes e projeção")
    p.section("Adicionar suplentes")
    p.numbered([
        [("Clicar no botão ", False), ("Suplentes", True), (" .", False)],
        [("Pesquisar, se necessário, pelo nome ou pelo escalão.", False)],
        [("Selecionar as jogadoras que ficam no banco.", False)],
        [("Confirmar se aparecem na zona ", False), ("Banco", True), (", por baixo do campo.", False)],
    ])
    p.section("Como a tática projeta as linhas")
    p.bullets([
        [("Cada número é uma linha no campo.", False)],
        [("O hífen separa as linhas.", False)],
        [("1-3-4-3", True), (" cria guarda-redes, linha de 3, linha de 4 e linha de 3.", False)],
        [("A Live usa a mesma projeção guardada, acrescentando fotos e nomes.", False)],
    ])
    p.note("Se mudares a tática depois de escolher jogadoras, confirma visualmente o campo e volta a clicar em Guardar ficha.")
    p.section("Guardar ficha")
    p.numbered([
        [("Confirmar titulares, suplentes e tática.", False)],
        [("Clicar em ", False), ("Guardar ficha", True), (" .", False)],
        [("Só depois de guardar a ficha se deve iniciar o jogo.", False)],
    ])
    p.image(shots["pesquisa"], "Barra de pesquisa e jogadoras de diferentes escalões", 760, 650)
    pages.append(p)

    p = Page(3)
    p.title("Durante o jogo", "Controlar a Live e registar eventos")
    p.section("Botões de estado do jogo")
    p.numbered([
        [("No apito inicial, clicar em ", False), ("Início do jogo", True), (" .", False)],
        [("No intervalo, clicar em ", False), ("Fim da 1ª parte", True), (" .", False)],
        [("No recomeço, clicar em ", False), ("Início da 2ª parte", True), (" .", False)],
        [("No fim da partida, clicar em ", False), ("Fim de jogo", True), (" .", False)],
    ])
    p.section("Registar eventos")
    p.numbered([
        [("Escolher o tipo de evento: golo, substituição, canto, cartão ou falta.", False)],
        [("Escolher a equipa: ", False), ("Casa Pia", True), (" ou ", False), ("Adversário", True), (" .", False)],
        [("Quando é Casa Pia, escolher a jogadora apenas entre as que estão na ficha guardada.", False)],
        [("Quando é adversário, não é obrigatório indicar jogadora.", False)],
        [("Clicar em ", False), ("Registar", True), (" .", False)],
    ])
    p.note("Se houver erro, o delegado pode apagar o evento na zona Eventos deste jogo.")
    p.image(demo["delegate_events"], "Exemplo no Delegado: eventos registados e botão Apagar", 1000, 610)
    pages.append(p)

    p = Page(4)
    p.title("Live e fecho da partida", "O que confirmar")
    p.section("O que aparece ao espectador")
    p.bullets([
        [("Marcador e estado do jogo.", False)],
        [("Ficha de jogo com a mesma tática do delegado.", False)],
        [("Fotos e nomes das jogadoras quando existem.", False)],
        [("Eventos em ordem cronológica.", False)],
        [("Sem botões de apagar eventos.", False)],
    ])
    p.section("Depois do fim de jogo")
    p.numbered([
        [("Confirmar se o marcador está correto.", False)],
        [("Clicar em ", False), ("Fim de jogo", True), (" no controlo de eventos.", False)],
        [("Abrir a página ", False), ("Live", True), (" e confirmar que aparece ", False), ("Resultado final", True), (" .", False)],
        [("Deixar o jogo visível até ser removido pela gestão da plataforma.", False)],
    ])
    p.note("Checklist final: ficha guardada, tática confirmada, eventos registados, Fim de jogo carregado e resultado final visível na Live.")
    p.image(demo["live_events_tactic"], "Exemplo na Live: eventos, marcador e ficha tática", 1000, 690)
    pages.append(p)

    total = len(pages)
    rgb_pages = []
    for p in pages:
        p.footer(total)
        out = OUT_DIR / f"compacto_pagina_{p.number:02d}.png"
        p.img.convert("RGB").save(out, quality=95)
        rgb_pages.append(p.img.convert("RGB"))

    rgb_pages[0].save(PDF_PATH, "PDF", save_all=True, append_images=rgb_pages[1:], resolution=150.0)
    print(PDF_PATH)


if __name__ == "__main__":
    build()
