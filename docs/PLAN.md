# BioLicensing — Plan de développement

> Équipe : FASSINOU Aziz · CHAFI Marwane · Antoine
> Échéance : HackMeridian, Lisbonne, 25–26 octobre 2026
> Rédigé le 22 octobre 2026

Ce document décrit tout ce qu'il faut construire, dans quel ordre, et ce qui
doit être « fini » à chaque étape. On ne commence le code qu'une fois ce plan
validé par l'équipe.

---

## 1. Objectif du MVP

Une démo **de bout en bout sur le testnet Stellar**, jouable en 3 minutes devant
le jury :

1. Une chercheuse dépose un brevet → un **IP-NFT de licence** est frappé.
2. Un fonds engage des **EURC** dans un **escrow à 3 jalons** → il reçoit des **parts**.
3. Le labo soumet la preuve du jalon 1 → **fenêtre de contestation**.
4. Sans contestation → la tranche d'EURC est **libérée automatiquement** au labo.
5. Un industriel paie une **redevance** → elle est **répartie** entre université,
   inventeurs et détenteurs de parts, qui la **retirent** quand ils veulent.

Chaque étape doit être visible sur `stellar.expert` (testnet).

**Hors périmètre du MVP** (mentionné dans le pitch comme feuille de route) :
mainnet, vrai KYC (SEP-12), anchors SEPA (SEP-24), marché secondaire des parts,
audit de sécurité.

---

## 2. Architecture

```
┌──────────────────────────── Front-end ────────────────────────────┐
│ React + Vite + TypeScript · Stellar Wallets Kit (Freighter)       │
│ Bindings TS générés par `stellar contract bindings typescript`    │
└───────────────┬───────────────────┬───────────────────┬───────────┘
                │                   │                   │
      ┌─────────▼────────┐ ┌────────▼─────────┐ ┌───────▼──────────┐
      │ ip_license_nft   │ │ milestone_escrow │─▶ royalty_splitter │
      │ licences + NDA   │ │ EURC + jalons    │ │ parts + redevances│
      └──────────────────┘ └────────┬─────────┘ └───────┬──────────┘
                                    │                   │
                          ┌─────────▼───────────────────▼─────────┐
                          │ EURC (Stellar Asset Contract, SAC)    │
                          └───────────────────────────────────────┘
Fichiers du dossier scientifique : hash SHA-256 calculé dans le navigateur
(+ envoi optionnel chiffré sur IPFS).
```

**Choix structurants**

| Décision | Choix | Pourquoi |
|---|---|---|
| Une instance par contrat ou par licence ? | **Une instance par contrat**, données indexées par `license_id` | Un seul déploiement, front plus simple |
| Backend ? | **Aucun** pour le MVP : le front lit l'état des contrats via RPC | Moins de code, moins de pannes en démo |
| Jeton de parts | **Intégré à `royalty_splitter`** (interface type SEP-41 : `balance`, `transfer`) avec **liste blanche KYC** et **clawback** admin | Le partage des redevances au prorata exige que le contrat voie chaque transfert (voir §3.3). Un actif classique ne le permet pas |
| EURC | EURC officiel de Circle sur testnet si dispo ; sinon un actif de test `EURC` émis par nous et enveloppé en SAC | La démo ne doit pas dépendre d'un faucet externe |
| Arbitrage | Adresse « arbitre » fixée à la création du projet | Simple, explicable, conforme au pitch |

> ⚠️ Alignement pitch / code : la diapo « parts » doit dire « jeton de parts
> Soroban avec liste blanche KYC et clawback, sur le modèle des actifs régulés
> Stellar », pas « actif Stellar classique ».

---

## 3. Spécification des contrats (Rust, `soroban-sdk`)

Conventions : montants en `i128` (7 décimales comme l'EURC), pourcentages en
**points de base** (`bps`, 10 000 = 100 %), durées en secondes, horodatage via
`env.ledger().timestamp()`. Chaque action émet un **événement** (le front et la
démo s'en servent).

### 3.1 `ip_license_nft`

Stockage : `Admin`, `NextId`, `Institution(Address) -> bool`,
`License(u64) -> License`, `NdaSigned(u64, Address) -> u64 (timestamp)`.

```rust
struct LicenseTerms { exclusive: bool, territory: String, field: String, duration_years: u32 }
struct License {
    id: u64, owner: Address /* université / labo */, title: String,
    inventors: Vec<Address>, terms: LicenseTerms,
    dossier_hash: BytesN<32>, metadata_uri: String, created_at: u64,
}

fn __constructor(env, admin: Address)
fn register_institution(env, institution: Address)          // admin
fn mint(env, owner: Address, title: String, inventors: Vec<Address>,
        terms: LicenseTerms, dossier_hash: BytesN<32>, metadata_uri: String) -> u64  // owner.require_auth + institution vérifiée
fn get_license(env, id: u64) -> License
fn list_licenses(env, start: u64, limit: u32) -> Vec<License>
fn owner_of(env, id: u64) -> Address
fn transfer(env, id: u64, from: Address, to: Address)      // from.require_auth ; to doit être une institution
fn sign_nda(env, id: u64, viewer: Address)                  // viewer.require_auth ; trace on-chain l'accès au dossier
fn has_signed_nda(env, id: u64, viewer: Address) -> bool
```

Événements : `minted`, `transferred`, `nda_signed`.

### 3.2 `milestone_escrow`

Stockage : `Admin`, `Token` (EURC), `Splitter` (adresse de `royalty_splitter`),
`Treasury`, `FeeBps`, `NextId`, `Project(u64) -> Project`.

```rust
enum MilestoneStatus { Pending, Submitted, Disputed, Released, Refunded }
struct Milestone { amount: i128, status: MilestoneStatus, proof_hash: Option<BytesN<32>>,
                   submitted_at: u64, dispute_reason: Option<BytesN<32>> }
struct Project { id: u64, license_id: u64, lab: Address, investor: Address, arbiter: Address,
                 challenge_period: u64, funded: bool, milestones: Vec<Milestone> }

fn __constructor(env, admin, token: Address, splitter: Address, treasury: Address, fee_bps: u32)
fn create_project(env, license_id, lab, investor, arbiter, amounts: Vec<i128>, challenge_period: u64) -> u64  // lab.require_auth
fn fund(env, project_id)               // investor.require_auth ; transfère la somme totale vers le contrat
                                       // puis appelle splitter.mint_shares(license_id, investor, total)
fn submit_milestone(env, project_id, index: u32, proof_hash: BytesN<32>)   // lab ; Pending -> Submitted
fn dispute(env, project_id, index: u32, reason_hash: BytesN<32>)           // investor ; seulement pendant la fenêtre
fn release(env, project_id, index: u32)    // n'importe qui ; Submitted + fenêtre expirée -> Released
                                           // paie lab (montant - frais) et treasury (frais)
fn resolve(env, project_id, index: u32, approve: bool)  // arbiter ; Disputed -> Released ou Refunded (vers investor)
fn cancel(env, project_id)                 // investor + lab ; rembourse les jalons Pending
fn get_project(env, project_id) -> Project
fn list_projects_by_license(env, license_id) -> Vec<u64>
```

Règles de sécurité à tester : jalons libérés **dans l'ordre**, pas de double
libération, pas de contestation après la fenêtre, seul l'arbitre résout, la
somme des sorties ne dépasse jamais le dépôt.

### 3.3 `royalty_splitter` (redevances + parts)

Principe : pour chaque licence, des parts fixes (université, inventeurs) et une
part « investisseurs » répartie **au prorata des parts détenues**. On utilise un
**accumulateur par part** (pattern « dividendes ») : coût constant quel que soit
le nombre de détenteurs, et chacun retire à la demande (*pull*).

Stockage : `Admin`, `Token`, `Treasury`, `FeeBps`, `Minter` (= escrow),
`Allowed(Address) -> bool` (liste blanche KYC),
`Config(u64) -> SplitConfig`, `TotalShares(u64)`, `Shares(u64, Address)`,
`AccPerShare(u64)` (× 1e12), `Debt(u64, Address)`, `Claimable(u64, Address)`.

```rust
struct Beneficiary { addr: Address, bps: u32 }
struct SplitConfig { fixed: Vec<Beneficiary> /* université, inventeurs */, investors_bps: u32 }  // somme = 10 000

fn __constructor(env, admin, token, treasury, fee_bps: u32)
fn set_minter(env, minter: Address)                     // admin (adresse de l'escrow)
fn set_allowed(env, who: Address, allowed: bool)        // admin = « KYC validé »
fn configure(env, license_id, config: SplitConfig)      // propriétaire de la licence, une seule fois
fn mint_shares(env, license_id, to: Address, amount: i128)    // minter ; `to` doit être en liste blanche
fn transfer_shares(env, license_id, from, to, amount)  // from.require_auth ; from et to en liste blanche ; règle les gains avant
fn clawback(env, license_id, from: Address, amount: i128)     // admin
fn pay_royalty(env, license_id, payer: Address, amount: i128) // payer.require_auth ; frais -> treasury ;
                                                              // parts fixes -> Claimable ; part investisseurs -> AccPerShare
fn claimable(env, license_id, who: Address) -> i128
fn claim(env, license_id, who: Address) -> i128              // who.require_auth ; transfère les EURC
fn shares_of(env, license_id, who: Address) -> i128
fn total_shares(env, license_id) -> i128
```

Cas limite : si `TotalShares == 0` au moment d'un paiement, la part
investisseurs revient au propriétaire de la licence.

---

## 4. Front-end

Stack : React 18 + Vite + TypeScript, Tailwind, `@stellar/stellar-sdk`,
`@creit.tech/stellar-wallets-kit`, bindings TS générés pour les 3 contrats.

| Écran | Rôle | Contenu |
|---|---|---|
| Accueil / Marketplace | Tous | Liste des licences, montant levé, jalons atteints |
| Déposer une licence | Labo | Formulaire en 3 étapes : infos, termes, dossier (hash calculé dans le navigateur) → `mint` + `configure` + `create_project` |
| Fiche licence | Tous | Termes, empreinte, frise des jalons, répartition des redevances, liens stellar.expert |
| Financer | Investisseur | Bouton « Financer X EURC » → `fund` |
| Tableau de bord labo | Labo | Soumettre une preuve, voir les fonds reçus |
| Tableau de bord investisseur | Investisseur | Parts détenues, contester un jalon, redevances à retirer |
| Payer une redevance | Industriel | `pay_royalty` |
| Admin / Arbitre | Plateforme | Liste blanche KYC, institutions, résolution des litiges |

**Mode démo** : un sélecteur de rôle (Labo / Fonds / Industriel / Arbitre)
qui signe avec 4 comptes testnet pré-approvisionnés, pour enchaîner la démo sans
changer de compte Freighter. Freighter reste disponible en mode normal.
Les clés de démo sont **testnet uniquement**, dans `.env.local` (jamais commité).

Principe UX : **zéro jargon crypto** pour le chercheur (« Déposer », « Recevoir
les fonds », pas « signer une transaction »). Chaque action affiche un toast avec
le lien vers la transaction.

---

## 5. Organisation du dépôt

```
HackMeridian_Project/
├── README.md
├── docs/PLAN.md                 ← ce document
├── contracts/                   ← workspace Cargo
│   ├── Cargo.toml
│   ├── ip_license_nft/
│   ├── milestone_escrow/
│   └── royalty_splitter/
├── scripts/
│   ├── setup-accounts.sh        ← crée et approvisionne les comptes testnet
│   ├── deploy.sh                ← build + deploy + init, écrit les IDs dans frontend/.env
│   └── seed-demo.sh             ← prépare un état de démo propre
└── frontend/
```

---

## 6. Planning (J = jour)

Il reste 3 jours avant le départ. Le planning est serré : chaque bloc a une
**définition de « fini »**. Les rôles sont une proposition à ajuster selon les
compétences de chacun.

| Quand | Bloc | Qui | Fini quand… |
|---|---|---|---|
| **J0 — 22 oct.** | 0. Dépôt git, plan, pitch FR + EN | Tous + Claude | Plan validé par l'équipe |
| J0 | 1. Outils : Rust, `stellar` CLI, cible `wasm32v1-none`, Node 22, Freighter (testnet) | Chacun | `stellar contract build` passe sur un contrat vide |
| J0 | 2. Vérifier l'EURC testnet de Circle + faucet ; sinon créer notre actif de test | Aziz | Un compte testnet détient des EURC |
| **J1 — 23 oct.** | 3. `ip_license_nft` + tests | Aziz + Claude | `cargo test` vert |
| J1 | 4. `royalty_splitter` + tests (accumulateur, liste blanche, clawback) | Aziz + Claude | `cargo test` vert, cas limites couverts |
| J1 | 5. `milestone_escrow` + tests (fenêtre, litige, appel au splitter) | Aziz + Claude | `cargo test` vert, test d'intégration des 3 contrats |
| J1 | 6. Squelette front, design, wallet, sélecteur de rôle | Marwane + Claude | Connexion Freighter OK |
| J1 soir | 7. `deploy.sh` sur testnet + bindings TS | Aziz | 3 IDs de contrat dans `.env`, bindings générés |
| **J2 — 24 oct.** | 8. Écrans : marketplace, dépôt, fiche licence | Marwane + Claude | Dépôt d'une licence réelle sur testnet depuis l'UI |
| J2 | 9. Écrans : financer, jalons, contestation, arbitre | Marwane + Claude | Jalon libéré depuis l'UI |
| J2 | 10. Écrans : redevances, retrait | Marwane + Claude | Redevance répartie et retirée depuis l'UI |
| J2 | 11. Scénario de démo, `seed-demo.sh`, compléter les champs `[…]` du pitch | Antoine | Démo jouable d'un bout à l'autre |
| J2 soir | 12. Vidéo de secours de la démo, README final | Antoine | Vidéo de 3 min enregistrée |
| **25–26 oct.** | 13. Répétitions, polissage, corrections | Tous | Pitch + démo tenus en 5 min sans accroc |

**Ordre critique** : contrats → déploiement → front. Le front peut démarrer en
parallèle avec des données fictives, puis brancher les bindings au bloc 7.

---

## 7. Tests et qualité

- Tests unitaires Soroban pour chaque fonction (cas nominal + chaque `panic`
  attendu), avec `env.mock_all_auths()` et un SAC EURC de test
  (`register_stellar_asset_contract_v2`).
- Un test d'intégration qui rejoue **exactement** le scénario de démo.
- Avant la démo : `seed-demo.sh` relancé à blanc au moins 3 fois.

## 8. Risques et parades

| Risque | Parade |
|---|---|
| RPC testnet lent ou en panne pendant la démo | Vidéo de secours + état pré-semé |
| Wi-Fi du lieu instable | Partage de connexion 4G préparé |
| Fenêtre de contestation trop longue pour la démo | `challenge_period` de 60 s pour le projet de démo |
| Pas d'EURC testnet officiel disponible | Actif de test `EURC` émis par nous (dit honnêtement au jury) |
| Question juridique du jury | Réponse préparée : « conçu pour être conforme, avis juridique en phase 2 » |
| Manque de temps sur le front | Priorité : dépôt → financement → jalon → redevance ; le reste est optionnel |

## 9. Définition du « fini » pour le hackathon

- [ ] 3 contrats déployés sur testnet, tests verts
- [ ] Le scénario de démo complet fonctionne depuis l'interface
- [ ] Chaque étape s'ouvre sur stellar.expert
- [ ] README avec installation, IDs des contrats, captures d'écran
- [ ] Pitch FR + EN finalisés, champs `[…]` remplis
- [ ] Vidéo de secours
