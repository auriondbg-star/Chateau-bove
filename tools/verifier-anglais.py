"""Vérifie que chaque texte du site public a sa traduction anglaise (en.js) et espagnole (es.js).

Lancer depuis la racine du dépôt :  python3 tools/verifier-anglais.py
Affiche les textes de index.html (hors espace propriétaire) qui n'ont pas de traduction, langue par langue.
Les textes écrits dans le JavaScript avec tr('...') sont aussi vérifiés.
"""
import json, re, sys
from html.parser import HTMLParser
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
html = (RACINE / 'index.html').read_text(encoding='utf-8')
LANGUES = {'en.js': 'anglaise', 'es.js': 'espagnole'}

# textes qui restent identiques dans les deux langues
IDENTIQUES = {'La Bôve', 'la Bôve', 'Château de la Bôve', 'Laon', 'Reims', '35 min', '· 20 min', '· 35 min',
              'Chemin des Dames', '02860 Bouconville-Vauclair', 'chateaudelabove@gmail.com', 'English version',
              'EN', 'ES', 'FR', 'Versión en español', 'Version française'}
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
utile = lambda s: s and re.search(r'[A-Za-zÀ-ÿ]', s) and s not in IDENTIQUES


erreur = False
for fichier, nom_langue in LANGUES.items():
    texte_js = (RACINE / fichier).read_text(encoding='utf-8')
    # clés du fichier : chaque ligne  "clé": "valeur",
    cles = set()
    for m in re.finditer(r'^\s*("(?:[^"\\]|\\.)*")\s*:\s*"', texte_js, re.M):
        cles.add(json.loads(m.group(1)))

    class Lecteur(HTMLParser):
        def __init__(self):
            super().__init__()
            self.pile, self.manquants, self.ignore = [], [], 0

        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            vide = tag in ('img', 'input', 'meta', 'link', 'br', 'hr', 'source')
            dans_admin = a.get('id') == 'admin' or self.ignore
            if not vide:
                self.pile.append((tag, dans_admin))
                self.ignore = dans_admin or tag in ('script', 'style', 'head')
            if self.ignore or (vide and dans_admin):
                return
            for nom in ('alt', 'placeholder', 'aria-label', 'title'):
                v = norm(a.get(nom) or '')
                if utile(v) and v not in cles:
                    self.manquants.append(f'[{nom}] {v}')

        def handle_endtag(self, tag):
            while self.pile:
                t, _ = self.pile.pop()
                if t == tag:
                    break
            self.ignore = bool(self.pile and (self.pile[-1][1] or self.pile[-1][0] in ('script', 'style', 'head')))

        def handle_data(self, data):
            v = norm(data)
            if not self.ignore and utile(v) and v not in cles:
                self.manquants.append(v)


    lecteur = Lecteur()
    lecteur.feed(html)
    manquants = list(dict.fromkeys(lecteur.manquants))

    # textes du JavaScript passés à tr('...')
    for m in re.finditer(r"tr\(\s*(['\"])((?:(?!\1)[^\\]|\\.)*)\1\s*\)", html):
        v = norm(m.group(2).replace("\\'", "'"))
        if utile(v) and v not in cles and v not in manquants:
            manquants.append(f'[script] {v}')
    # libellés des photos (tableaux photos et LPHOTOS)
    blocs = re.findall(r'const photos=\[.*?\];', html, re.S) + re.findall(r'const LPHOTOS=\{.*?\}\};', html, re.S)
    for m in re.finditer(r"\['[a-z0-9-]+',\s*(['\"])((?:(?!\1)[^\\]|\\.)*)\1\]", ''.join(blocs)):
        v = norm(m.group(2).replace("\\'", "'"))
        if utile(v) and v not in cles and v not in manquants:
            manquants.append(f'[photo] {v}')

    if manquants:
        print(f'{len(manquants)} texte(s) sans traduction {nom_langue} dans {fichier} :')
        for v in manquants:
            print('  -', v)
        erreur = True
    else:
        print(f'Tout le site public a sa traduction {nom_langue}.')
sys.exit(1 if erreur else 0)
