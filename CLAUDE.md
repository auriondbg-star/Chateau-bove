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

## Paiement par carte des logements (Stripe)
- Code serveur : `tools/supabase/paiement.ts` (fonction Supabase « paiement »). Installation : `tools/supabase/INSTALLATION.md`.
- Activé seulement si `paiementCarte: true` dans `config.js`.
- Les prix, le séjour minimum et les conditions d'annulation (90 % remboursés à plus de 7 jours, 40 % à 7 jours ou moins) existent à trois endroits : `index.html`, `tools/supabase/paiement.ts` et `mentions-legales.html`. Toujours modifier les trois ensemble ; le propriétaire doit ensuite recopier la fonction dans Supabase.

## Animations
- Bloc CSS « animations » (après la règle prefers-reduced-motion) et dernier <script> de `index.html` : apparition au défilement (.rv / .rvi), compteurs des chiffres, barre de progression dorée, léger zoom du fond.
- 2e série : titres h2 mot à mot (.wsplit), partie verte (photo en fond qui glisse, halo doré, trait sous le titre, losanges dorés), onglets à fond glissant (.seg-ind), vague du calendrier au changement de mois, reflet doré des boutons.
- 3e série : grain léger sur les fonds clairs, dessin du château au trait doré qui se trace (.trace, dans Séminaires et en bas de page), traits dorés autour des petits titres centrés (.orn), passe-partout blanc et zoom lent sur les photos enveloppées dans .ph.
- Sans bibliothèque externe. Désactivées si l'appareil demande moins d'animations. Un nouvel élément s'anime s'il correspond aux sélecteurs TXT / IMG du script.

## Autres règles (voir la passation du projet)
- Répondre au propriétaire en français, phrases simples, sans estimation de temps.
- Le nom du propriétaire n'apparaît jamais sur le site (ce fichier est lui aussi public : n'y mettre aucun nom).
- Aucun siècle mentionné ; « duchesse de Narbonne » sans « -Lara ».
- Chaque envoi sur `main` est publié automatiquement par Cloudflare Pages.
