/*************************
  CONFIGURATION DE LA GALERIE
  API_URL : adresse de votre "Worker" Cloudflare (voir GUIDE_INSTALLATION.md).
  Tant qu'elle est vide, la galerie s'affiche mais le bouton
  "Ajouter à la galerie" indique que la fonction n'est pas encore activée.
**************************/
window.HEXA_CONFIG = {
  API_URL: "",                       // ex : "https://hexalampe-gallery.votrecompte.workers.dev"
  INDEX_URL: "models/index.json",    // liste des modèles (générée automatiquement)
  MAX_NAME: 30
};
