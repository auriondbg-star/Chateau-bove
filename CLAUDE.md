# Règles pour modifier ce site

## Version anglaise : à mettre à jour à chaque modification
Le site existe en français et en anglais (https://chateau-bove.pages.dev/?lang=en).
Les traductions sont dans `en.js` : chaque ligne associe un texte français exact à sa traduction anglaise.

À chaque modification d'un texte visible du site public (`index.html`, hors espace propriétaire `#admin`) :
1. Modifier le texte français dans `index.html`.
2. Dans `en.js`, remplacer l'ancienne clé française par la nouvelle et mettre à jour la traduction anglaise. Ajouter une ligne pour tout nouveau texte.
3. Les textes créés par le JavaScript passent par `tr('…')` (ou une condition `EN ? … : …`) et ont aussi leur ligne dans `en.js`.
4. Avant de publier, lancer `python3 tools/verifier-anglais.py`. Il doit afficher « Tout le site public a sa traduction anglaise. »
5. Vérifier aussi la page avec `?lang=en`.

Les valeurs enregistrées dans les demandes (options des listes, formules) restent en français : dans les listes, la valeur reste française et seul le texte affiché est traduit.
L'espace propriétaire, les e-mails reçus, les mentions légales et la brochure restent en français.

## Autres règles (voir la passation du projet)
- Répondre au propriétaire en français, phrases simples, sans estimation de temps.
- Le nom du propriétaire n'apparaît jamais sur le site (ce fichier est lui aussi public : n'y mettre aucun nom).
- Aucun siècle mentionné ; « duchesse de Narbonne » sans « -Lara ».
- Chaque envoi sur `main` est publié automatiquement par Cloudflare Pages.
