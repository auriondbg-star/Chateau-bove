# Mise en place du paiement par carte (gîte et appartement)

Tout se fait dans un navigateur (Safari sur iPad convient). Aucune clé ne doit être envoyée à qui que ce soit : elles se collent uniquement dans Supabase.

Fonctionnement une fois installé :
- le visiteur paie la totalité de son séjour par carte, sur la page sécurisée de Stripe ;
- la réservation passe en « Confirmée » et les nuits sont bloquées automatiquement ;
- en cas d'annulation, le bouton « Annuler et rembourser » de l'espace propriétaire rembourse 90 % (plus de 7 jours avant l'arrivée) ou 40 % (7 jours ou moins), ou la totalité si c'est le propriétaire qui annule.

Stripe ne facture ni abonnement ni frais annuels : seulement une commission sur chaque paiement. Les frais du paiement ne sont pas rendus en cas de remboursement.

## Étape 1 : créer le compte Stripe
1. Aller sur https://dashboard.stripe.com/register et créer le compte avec l'adresse chateaudelabove@gmail.com.
2. Type d'activité : particulier / entrepreneur individuel. Activité : location de logements de vacances.
3. Renseigner le RIB qui recevra l'argent et vérifier son identité, comme Stripe le demande.
4. Dans Paramètres › E-mails clients, activer « Paiements réussis » (le voyageur reçoit un reçu) et « Remboursements ».

## Étape 2 : installer la fonction dans Supabase
1. Ouvrir https://chateau-bove.pages.dev/tools/supabase/paiement.ts, tout sélectionner et copier.
2. Dans Supabase (projet ytqmuoutvtpopzuymbhb) : Edge Functions › Deploy a new function › Via Editor.
3. Nom de la fonction : `paiement` (exactement). Remplacer tout le texte de l'éditeur par celui copié, puis Deploy.
4. Dans la fonction › Details (ou Settings) : désactiver « Enforce JWT verification » (Verify JWT), puis enregistrer. C'est nécessaire pour que Stripe et les visiteurs puissent l'appeler ; la fonction fait ses propres vérifications.

## Étape 3 : la clé secrète de Stripe
1. Stripe › Développeurs › Clés API : copier la « Clé secrète » (elle commence par `sk_`).
2. Supabase › Edge Functions › Secrets › Add new secret : nom `STRIPE_SECRET_KEY`, valeur = la clé copiée. Enregistrer.

## Étape 4 : le message de Stripe après chaque paiement (webhook)
1. Stripe › Développeurs › Webhooks › Ajouter une destination (« Votre compte »).
2. Événements à cocher : `checkout.session.completed` et `checkout.session.expired`.
3. Type de destination : point de terminaison webhook. Adresse : `https://ytqmuoutvtpopzuymbhb.supabase.co/functions/v1/paiement`
4. Une fois créé, copier la « Clé secrète de signature » (elle commence par `whsec_`).
5. Supabase › Edge Functions › Secrets : nom `STRIPE_WEBHOOK_SECRET`, valeur = cette clé. Enregistrer.

## Étape 5 : activer sur le site
Prévenir Claude : il passe `paiementCarte` à `true` dans `config.js`. Le formulaire « Réserver un logement » devient « Payer et réserver ».

## Conseillé : faire un essai sans argent réel
Stripe a un « mode test » (interrupteur en haut du tableau de bord). En mode test, refaire les étapes 3 et 4 : les clés commencent par `sk_test_` et `whsec_`. Puis réserver sur le site avec la carte d'essai `4242 4242 4242 4242` (date future, code 123), vérifier la réservation dans l'espace propriétaire et essayer « Annuler et rembourser ».
Après l'essai : quitter le mode test, refaire les étapes 3 et 4 avec les vraies clés (elles remplacent les clés d'essai dans Supabase).

## Si quelque chose change
- Prix, séjour minimum ou conditions d'annulation : ils sont écrits à la fois dans `index.html` (affichage), dans `tools/supabase/paiement.ts` (prix réellement payé) et dans `mentions-legales.html` (conditions). Les trois doivent être modifiés ensemble, puis la fonction recopiée dans Supabase (étape 2, sans refaire les étapes 3 et 4).
