# Caisse Joséphine — guide d'installation pas à pas

Ce guide ne demande aucune connaissance technique. Comptez environ **45 minutes** la première fois.
Prévoyez : un ordinateur, le compte Google du café, l'iPad, et le téléphone de Nathalie.

Le projet comprend trois parties :

| Partie | À quoi elle sert | Où elle se trouve |
|---|---|---|
| **L'application de comptage** | Compter la caisse matin et soir sur l'iPad, même sans wifi | Sur l'iPad (icône Joséphine) |
| **Le Google Sheet « Caisse Joséphine »** | Recevoir une copie de chaque comptage, envoyer les alertes e-mail | Dans le Google Drive du café |
| **La page « Suivi caisse »** | Permettre à Nathalie de suivre les comptages depuis son téléphone | Sur l'écran d'accueil de Nathalie |

---

## Étape 1 — Créer le Google Sheet et installer le script

1. Sur l'ordinateur, connectez-vous au **compte Google du café** (c'est lui qui enverra les e-mails d'alerte).
2. Ouvrez **https://sheets.new** : un tableur vide s'ouvre. Cliquez sur « Feuille de calcul sans titre » en haut à gauche et renommez-le **Caisse Joséphine**.
3. Dans le menu, cliquez sur **Extensions › Apps Script**. Un nouvel onglet s'ouvre avec un éditeur de code.
4. Effacez tout le texte présent (`function myFunction() {…}`).
5. Ouvrez le fichier **`google/Code.gs`** du projet (avec TextEdit ou n'importe quel éditeur de texte), **copiez tout son contenu** et **collez-le** dans l'éditeur.
6. En haut, cliquez sur « Projet sans titre » et renommez-le **Caisse Joséphine**. Cliquez sur l'icône **disquette** (Enregistrer).
7. Dans la liste déroulante à droite du bouton « Déboguer », choisissez **installer**, puis cliquez sur **▶ Exécuter**.
8. Google demande une autorisation (c'est normal, la première fois seulement) :
   - **Examiner les autorisations** › choisissez le compte du café ;
   - message « Google n'a pas validé cette application » : cliquez sur **Paramètres avancés**, puis **Accéder à Caisse Joséphine (non sécurisé)**. Ce message apparaît parce que c'est *votre propre* script, pas une application publique ;
   - cliquez sur **Autoriser**.
9. Revenez à l'onglet du Google Sheet : trois onglets ont été créés, **Comptages**, **Détail** et **Réglages**.

### Remplir l'onglet « Réglages »

Seules les cases jaunes sont à vérifier :

- **Destinataires des alertes** : l'adresse e-mail de Nathalie (et la vôtre si vous le souhaitez), séparées par une virgule.
- **Seuil d'alerte écart** : `0,01` (alerte dès 1 centime).
- **Heures de vérification** : `09:45` (ouverture) et `17:55` (clôture).
- **Jours d'ouverture** : `lundi, mardi, mercredi, jeudi, vendredi, samedi`.
- **Dates de fermeture exceptionnelle** : une date par ligne dans la colonne B, sous la ligne grise (ex. `25/12/2026`). Aucune alerte ces jours-là.
- **Clé secrète de l'iPad** et **Code d'accès Suivi caisse** : créés automatiquement. **Notez-les**, ils serviront aux étapes 3 et 4. Ne les modifiez pas sans raison.
- **Adresse de la page Suivi caisse** : vous la compléterez à l'étape 2.

### Publier le script (pour que l'iPad puisse lui envoyer les comptages)

10. Dans l'onglet Apps Script, cliquez sur **Déployer › Nouveau déploiement**.
11. Cliquez sur la roue dentée ⚙ à côté de « Sélectionner le type » › **Application Web**.
12. Remplissez :
    - Description : `Caisse`
    - Exécuter en tant que : **Moi**
    - Qui a accès : **Tout le monde**
13. Cliquez sur **Déployer**, puis **copiez l'adresse « Application Web »** (elle commence par `https://script.google.com/macros/s/` et se termine par `/exec`). Gardez-la pour l'étape 2.

> **Pourquoi « Tout le monde » ?** Pour que l'iPad puisse envoyer les comptages sans compte Google. C'est sans risque : sans la **clé secrète**, personne ne peut rien écrire, et sans le **code d'accès**, personne ne peut rien lire. Une personne qui trouverait l'adresse ne verrait rien.

14. Rechargez l'onglet du Google Sheet : un menu **Caisse Joséphine** apparaît. Cliquez sur **Caisse Joséphine › Envoyer un e-mail de test** et vérifiez que l'e-mail arrive (regardez aussi dans les courriers indésirables).

La vérification automatique des oublis tourne toute seule toutes les 5 minutes : l'e-mail « Aucun comptage d'ouverture reçu ce matin » part donc entre 9 h 45 et 9 h 50, une seule fois par jour.

### Connecter Square (caisse théorique du soir)

À la clôture, l'application calcule elle-même la **caisse théorique** :
caisse du matin + ventes en espèces du jour (lues dans Square) – remboursements en espèces ± mouvements divers.
L'**écart** = caisse comptée – caisse théorique ; une alerte part à Nathalie s'il n'est pas nul.
Plus besoin d'ouvrir ni de clôturer la session de caisse dans Square.

1. Allez sur **https://developer.squareup.com**, connectez-vous avec le compte Square du café.
2. Cliquez sur **+** (ou « Create an application »), nommez-la `Caisse Joséphine`, validez.
3. Ouvrez l'application créée › **Credentials**, choisissez **Production** en haut de la page.
4. Dans **Production Access token**, cliquez sur **Show** puis copiez le jeton (il commence par `EAAA`).
5. Dans le Google Sheet, menu **Caisse Joséphine › Connecter Square (ventes en espèces)**, collez le jeton, **OK**.
   (La première fois, Google demande une autorisation supplémentaire pour « se connecter à un service externe » : acceptez.)
6. Un message confirme la connexion et affiche les ventes en espèces du jour.

Le jeton est gardé dans le script Google (jamais dans le Sheet, sur l'iPad ou sur GitHub). Ne le communiquez à personne. Pour le changer, relancez simplement *Connecter Square*.

---

## Étape 2 — Mettre l'application en ligne (GitHub Pages, gratuit)

GitHub Pages héberge gratuitement l'application. Les fichiers sont publics, mais **ils ne contiennent aucune donnée ni aucun secret** : les comptages restent sur l'iPad et dans votre Google Sheet, et la clé secrète se saisit sur l'iPad.

1. Créez un compte gratuit sur **https://github.com** (bouton « Sign up »).
2. **Avant l'envoi**, ouvrez le fichier **`js/config.js`** avec TextEdit (menu Format › « Convertir au format texte » si besoin) et collez l'adresse du script entre les apostrophes :
   ```js
   SCRIPT_URL: 'https://script.google.com/macros/s/……/exec',
   ```
   Enregistrez.
3. Sur GitHub, cliquez sur **+** (en haut à droite) › **New repository** :
   - Repository name : `caisse-josephine`
   - Visibilité : **Public**
   - cliquez sur **Create repository**.
4. Sur la page suivante, cliquez sur le lien **uploading an existing file**.
5. Ouvrez le dossier `caisse-josephine` sur l'ordinateur, sélectionnez **tout son contenu** (les dossiers `css`, `google`, `img`, `js`, `lib`, `suivi`, `tests` et les fichiers `index.html`, `sw.js`, `manifest.webmanifest`, `GUIDE.md`…) et faites-le **glisser** dans la fenêtre GitHub. Attendez la fin du chargement, puis cliquez sur **Commit changes**.
6. Cliquez sur **Settings** (onglet du dépôt) › **Pages** (menu de gauche) :
   - Source : **Deploy from a branch**
   - Branch : **main** et **/ (root)** › **Save**.
7. Patientez 1 à 2 minutes et rechargez la page : l'adresse de votre application s'affiche, du type
   **`https://VOTRE-NOM.github.io/caisse-josephine/`**
8. Vérifications :
   - ouvrez cette adresse sur l'ordinateur : l'écran avec les deux grands boutons doit s'afficher ;
   - ouvrez `https://VOTRE-NOM.github.io/caisse-josephine/tests/` : la page doit indiquer « Les 17 tests sont réussis ».
9. Dans l'onglet **Réglages** du Google Sheet, case **Adresse de la page Suivi caisse**, saisissez :
   `https://VOTRE-NOM.github.io/caisse-josephine/suivi/`
   (ce lien figurera dans les e-mails d'alerte).

---

## Étape 3 — Installer l'application sur l'iPad

1. Sur l'iPad, ouvrez **Safari** (pas Chrome) et allez à l'adresse `https://VOTRE-NOM.github.io/caisse-josephine/`.
2. Touchez le bouton **Partager** (carré avec une flèche vers le haut) › **Sur l'écran d'accueil** › **Ajouter**.
3. Fermez Safari et ouvrez l'application depuis la nouvelle **icône Joséphine** : elle s'ouvre en plein écran.
4. Touchez **Historique** › **Réglages et sauvegarde** (en bas) :
   - saisissez la **Clé secrète de l'iPad** (notée à l'étape 1) › **Enregistrer** ;
   - touchez **Tester la connexion** : « ✓ Connexion réussie » doit s'afficher.
5. Faites un **comptage d'essai** (ouverture), puis vérifiez qu'une ligne apparaît dans l'onglet **Comptages** du Google Sheet au bout de quelques secondes. Vous pourrez ensuite supprimer ce comptage d'essai : sur l'iPad (Historique › le comptage › Supprimer de l'iPad) et dans le Sheet (supprimez les lignes correspondantes dans **Comptages** et **Détail**).

Bon à savoir :
- L'application **fonctionne sans wifi**. Les comptages sont enregistrés sur l'iPad et envoyés automatiquement dès le retour de la connexion (indicateur discret « en attente d'envoi » en haut à droite).
- **Ne supprimez pas** les données de Safari dans les réglages de l'iPad (« Effacer historique et données de sites ») : cela pourrait effacer l'historique de l'application. Le Google Sheet en garde de toute façon une copie.
- Utilisez toujours l'icône de l'écran d'accueil, pas Safari : l'icône et Safari ont des données séparées.

---

## Étape 4 — Donner accès à la page « Suivi caisse » à Nathalie

**Solution retenue : un lien personnel avec code secret.** C'est la plus simple (pas de compte à créer) et elle est sûre :
- la page elle-même ne contient aucune donnée ; elle les demande au Google Sheet, qui ne répond **que si le code est correct** ;
- le code est placé après le signe `#` dans le lien : cette partie n'est jamais transmise à GitHub ;
- la page est en **lecture seule** : le code de suivi ne permet pas d'écrire (seule la clé de l'iPad le permet) ;
- pour retirer un accès, il suffit de **changer le code** dans l'onglet Réglages (effacez-le puis lancez *Caisse Joséphine › Installer / réparer* pour en générer un nouveau) et d'envoyer le nouveau lien.

1. Préparez le lien en ajoutant le **Code d'accès Suivi caisse** à la fin de l'adresse :
   `https://VOTRE-NOM.github.io/caisse-josephine/suivi/#code=XXXX-XXXX-XXXX-XXXX`
2. Envoyez ce lien à Nathalie par message privé (SMS, iMessage ou e-mail). Ne le publiez nulle part.
3. Sur son iPhone, Nathalie ouvre le lien dans **Safari**, puis **Partager › Sur l'écran d'accueil › Ajouter**.
4. Si la page demande le code à la première ouverture depuis l'écran d'accueil, elle le saisit une fois : il est ensuite mémorisé.

Nathalie reçoit aussi les **e-mails d'alerte** (écart dès 1 centime, ouverture ou clôture non reçue), avec un bouton qui ouvre la page.

---

## Étape 5 — Mettre à jour l'application

**Modifier l'application (iPad et page Suivi)**
1. Sur GitHub, ouvrez le dépôt `caisse-josephine`, cliquez sur le fichier à modifier puis sur le **crayon** (Edit), ou utilisez **Add file › Upload files** pour remplacer des fichiers.
2. Cliquez sur **Commit changes**. La nouvelle version est en ligne 1 à 2 minutes plus tard.
3. L'iPad la récupère **tout seul** à la prochaine ouverture avec du wifi. Astuce : changez le numéro `VERSION` dans `js/config.js` ; il s'affiche en bas de l'Historique, ce qui permet de vérifier que la mise à jour est arrivée.

**Modifier le script Google**
1. Collez le nouveau code dans Apps Script et enregistrez.
2. **Déployer › Gérer les déploiements** › crayon ✏️ › Version : **Nouvelle version** › **Déployer**. L'adresse ne change pas.

**Réglages fréquents**
- Alertes, heures, jours, fermetures, destinataires : onglet **Réglages** du Google Sheet (pas besoin de toucher au code).
- Limite de 20 pièces par valeur : constante `MAX_PIECES_PAR_VALEUR` dans `js/calc.js`. Fond de caisse : `FOND_DE_CAISSE` (en centimes : `10000` = 100,00 €).

---

## Étape 6 — Sauvegarder et restaurer

**Sauvegarder** (une fois par mois, et avant de changer d'iPad)
1. Dans l'application : **Historique › Réglages et sauvegarde › Exporter une sauvegarde**.
2. La feuille de partage s'ouvre : choisissez **Enregistrer dans Fichiers** (iCloud Drive) ou envoyez-la-vous par e-mail. Le fichier s'appelle `Josephine-sauvegarde-AAAA-MM-JJ.json`.

**Restaurer** (nouvel iPad, ou après une réinitialisation)
1. Installez l'application (étape 3) et saisissez la clé secrète.
2. **Historique › Réglages et sauvegarde › Restaurer une sauvegarde** › choisissez le fichier.
3. Les comptages sont ajoutés ; ceux déjà présents sont ignorés (aucun doublon).

**Le Google Sheet est aussi une copie de secours** de tous les comptages : vous pouvez le télécharger à tout moment (Fichier › Télécharger › Microsoft Excel), et Google conserve son historique des versions (Fichier › Historique des versions).

---

## Au quotidien

**Le matin (9 h 15)** : Ouverture – matin › saisir les pièces et billets › « Caisse juste » s'affiche en vert (sinon : recompter une fois, puis enregistrer le vrai montant avec une observation) › Valider et enregistrer. Rien à faire dans Square.

**Dans la journée** : si de l'argent sort de la caisse ou y entre en dehors d'une vente (achat payé en espèces, appoint…), le noter pour le saisir le soir comme « mouvement divers ».

**Le soir** : Clôture – soir › compter toute la caisse › le panneau de droite affiche la caisse théorique et l'écart (ajouter les mouvements divers avec « + Ajouter un mouvement ») › Suivant : répartition › l'application indique ce qui reste dans la caisse (100,00 €) et ce qui va au coffre › Valider et enregistrer › écrire **la date et le montant** sur l'enveloppe › ranger l'enveloppe dans le coffre › cocher les 2 cases › Terminer.

## En cas de problème

| Situation | Que faire |
|---|---|
| « en attente d'envoi » reste affiché | Normal sans wifi : l'envoi repartira tout seul. Sinon, Réglages et sauvegarde › Tester la connexion. |
| « Clé refusée » | Vérifiez la clé secrète (onglet Réglages du Sheet) et saisissez-la à nouveau sur l'iPad. |
| Aucun e-mail d'alerte | Vérifiez les courriers indésirables, la case « Destinataires » et « Alertes activées : Oui ». Lancez *Caisse Joséphine › Envoyer un e-mail de test*. |
| « Square n'est pas encore connecté » | Faites *Caisse Joséphine › Connecter Square* dans le Google Sheet (étape 1). |
| « Pas de connexion » pour les ventes | La clôture peut quand même être enregistrée : le Google Sheet calculera la caisse théorique à la réception. |
| Fermeture pour congés | Ajoutez les dates dans Réglages (ou mettez « Alertes activées : Non » pendant la période). |
| La page Suivi demande le code | Saisissez le Code d'accès Suivi caisse (onglet Réglages). |
| L'iPad n'affiche pas la nouvelle version | Fermez complètement l'application (balayer vers le haut) et rouvrez-la avec du wifi. |

---

## Ce que contient le projet

```
index.html, sw.js, manifest.webmanifest   application iPad (installable, hors connexion)
css/app.css                               mise en forme
js/calc.js                                tous les calculs (centimes entiers, répartition caisse/coffre)
js/app.js                                 écrans de l'application
js/db.js, js/sync.js                      stockage sur l'iPad et envoi vers le Google Sheet
js/pdf.js, js/visuels.js                  PDF A4 et dessins des pièces/billets
js/config.js                              ← adresse du script Google (seul fichier à modifier)
lib/jspdf.umd.min.js                      bibliothèque PDF incluse (licence MIT), aucun CDN
img/                                      logo et icônes
suivi/                                    page « Suivi caisse » de Nathalie
google/Code.gs                            script à coller dans le Google Sheet
tests/                                    tests automatisés des calculs (ouvrir tests/index.html)
```

Confidentialité : aucune publicité, aucun cookie, aucun suivi, aucun compte pour les salariées. Les données sont enregistrées sur l'iPad et copiées uniquement dans le Google Sheet du café ; seuls les prénoms saisis sont conservés.
