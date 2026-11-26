#!/usr/bin/env python3
"""Tests du site public, sans rien envoyer pour de vrai (mode démonstration).
Usage : python3 -m http.server 8765 &  puis  python3 tools/tester-site.py
Il faut Playwright et Google Chrome (/usr/bin/google-chrome)."""
from playwright.sync_api import sync_playwright
DEMO = "window.BOVE_CONFIG={url:'',anonKey:'',notifyUrl:'',notifyEmail:'',web3formsKey:'',paiementCarte:false};"
URL = 'http://localhost:8765/'
res = []
def ok(nom, cond): res.append((nom, bool(cond)))

def page(b, w, h):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.route('**/config.js', lambda r: r.fulfill(body=DEMO, content_type='text/javascript'))
    pg.route('https://**', lambda r: r.abort())          # aucun appel extérieur
    pg.errs, pg.bad = [], []
    pg.on('pageerror', lambda e: pg.errs.append(str(e)))
    pg.on('response', lambda r: r.status >= 400 and 'localhost' in r.url and pg.bad.append(r.url))
    return pg

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for lang in ('', '?lang=en', '?lang=es'):
        for w, h in ((390, 800), (1180, 820), (1440, 900)):
            t = f'{lang or "fr"} {w}px :'
            pg = page(b, w, h)
            pg.goto(URL + lang); pg.wait_for_timeout(3300)   # > 3 s : sinon le piège à robots bloque l'envoi
            pg.evaluate("document.getElementById('galerie').scrollIntoView()"); pg.wait_for_timeout(500)
            pg.click('#top3 button >> nth=0'); pg.wait_for_timeout(400)
            ok(t + ' visionneuse en grande taille', pg.evaluate("!document.getElementById('lb').hidden&&!document.getElementById('lbimg').src.includes('/m/')"))
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
            pg.click('#more-photos'); pg.wait_for_timeout(300); ok(t + ' autres photos', pg.is_visible('#grid'))
            pg.evaluate("document.getElementById('histoire').scrollIntoView()"); pg.wait_for_timeout(800)
            pg.locator('.livre').first.click(); pg.wait_for_timeout(1200)
            ok(t + ' livre ouvert', pg.evaluate("!document.querySelector('.livre-w').classList.contains('closed')"))
            ok(t + ' images du livre', pg.evaluate("[...document.querySelectorAll('.livre img')].slice(0,2).every(i=>i.complete&&i.naturalWidth>0)"))
            if w <= 1300:
                pg.click('#burger'); pg.wait_for_timeout(900); ok(t + ' menu ouvert', pg.evaluate("!document.getElementById('drw').hidden"))
                pg.click('#drw ul li:nth-child(6) a'); pg.wait_for_timeout(1200)
                ok(t + ' lien du menu', pg.evaluate("document.getElementById('drw').hidden&&Math.abs(document.getElementById('logements').getBoundingClientRect().top)<200"))
            pg.evaluate("document.getElementById('reserver').scrollIntoView()"); pg.wait_for_timeout(500)
            pg.click('#f button[type=submit]'); pg.wait_for_timeout(300)
            ok(t + ' formulaire : message et bloc ouvert', pg.evaluate("!document.getElementById('err').hidden&&document.getElementById('more').open"))
            pg.fill('#q-mail', 'a@b.fr'); pg.fill('#q-msg', 'test'); pg.click('#q-f button[type=submit]'); pg.wait_for_timeout(400)
            ok(t + ' « Une question ? »', pg.is_visible('#q-ok'))
            ok(t + ' pas d\'erreur JavaScript', not pg.errs); ok(t + ' pas de fichier manquant', not pg.bad)
            if pg.errs or pg.bad: print(t, pg.errs, pg.bad)
            pg.close()
    pg = page(b, 1180, 820); pg.goto(URL + '#admin'); pg.wait_for_timeout(1500)
    ok('espace propriétaire sans erreur', not pg.errs)
    b.close()
fails = [n for n, c in res if not c]
print(f'{len(res)} tests, {len(fails)} échec(s)'); [print('  ÉCHEC', n) for n in fails]
raise SystemExit(1 if fails else 0)
