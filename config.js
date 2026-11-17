// Paramètres publics du projet Supabase (Project Settings › API).
// La clé « anon public » est faite pour être visible : la sécurité repose sur les règles de la base (supabase/schema.sql).
// Laissées vides, le site fonctionne en mode démonstration (données enregistrées sur l'appareil seulement).
window.BOVE_CONFIG = {
  url: 'https://ytqmuoutvtpopzuymbhb.supabase.co',
  anonKey: 'sb_publishable_TlXrjpLgcVZ3XHaCQxWb2Q_JxNliAs6',
  // Lien du script Google (tools/gmail/Code.gs) qui envoie un e-mail en français avec le calendrier. Prioritaire s'il est rempli.
  notifyUrl: '',
  // Sinon, adresse qui reçoit un e-mail à chaque nouvelle demande (via formsubmit.co, sans compte).
  notifyEmail: 'chateaudelabove@gmail.com',
  // Clé Web3Forms (facultatif, non utilisé si notifyEmail est rempli) (web3forms.com) : envoie un e-mail à chaque nouvelle demande. Elle est faite pour être visible.
  web3formsKey: '',
  // Paiement par carte des logements (Stripe). Mettre true seulement quand l'installation est terminée
  // (tools/supabase/INSTALLATION.md). Tant que c'est false, le site envoie une simple demande, comme avant.
  paiementCarte: false
};
