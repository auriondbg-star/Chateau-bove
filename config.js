// Paramètres publics du projet Supabase (Project Settings › API).
// La clé « anon public » est faite pour être visible : la sécurité repose sur les règles de la base (supabase/schema.sql).
// Laissées vides, le site fonctionne en mode démonstration (données enregistrées sur l'appareil seulement).
window.BOVE_CONFIG = {
  url: 'https://ytqmuoutvtpopzuymbhb.supabase.co',
  anonKey: 'sb_publishable_TlXrjpLgcVZ3XHaCQxWb2Q_JxNliAs6',
  // Adresse qui reçoit un e-mail à chaque nouvelle demande (via formsubmit.co, sans compte).
  notifyEmail: 'chateaudelabove@gmail.com',
  // Clé Web3Forms (facultatif, non utilisé si notifyEmail est rempli) (web3forms.com) : envoie un e-mail à chaque nouvelle demande. Elle est faite pour être visible.
  web3formsKey: ''
};
