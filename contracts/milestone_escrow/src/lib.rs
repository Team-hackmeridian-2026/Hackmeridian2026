//! Escrow EURC à jalons avec validation optimiste.
//!
//! L'investisseur dépose la totalité des fonds ; le labo soumet la preuve
//! (empreinte d'un rapport) de chaque jalon ; sans contestation pendant la
//! fenêtre `challenge_period`, n'importe qui peut déclencher la libération.
//! En cas de contestation, l'arbitre désigné à la création tranche.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, BytesN, Env, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const BPS_DENOMINATOR: i128 = 10_000;
const MAX_MILESTONES: u32 = 10;

#[contractclient(name = "LicenseNftClient")]
pub trait LicenseNftInterface {
    fn owner_of(env: Env, id: u64) -> Address;
}

#[contractclient(name = "SplitterClient")]
pub trait SplitterInterface {
    fn is_configured(env: Env, license_id: u64) -> bool;
    fn mint_shares(env: Env, license_id: u64, to: Address, amount: i128);
    fn burn_shares(env: Env, license_id: u64, from: Address, amount: i128);
    fn shares_of(env: Env, license_id: u64, who: Address) -> i128;
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MilestoneStatus {
    Pending,
    Submitted,
    Disputed,
    Released,
    Refunded,
    /// L'arbitre a partagé la tranche : une part au labo, le reste remboursé.
    Split,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Milestone {
    pub amount: i128,
    pub status: MilestoneStatus,
    pub proof_hash: Option<BytesN<32>>,
    pub submitted_at: u64,
    pub dispute_reason: Option<BytesN<32>>,
    /// Part de la tranche versée au labo, en points de base (10 000 = tout).
    pub lab_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Project {
    pub id: u64,
    pub license_id: u64,
    pub lab: Address,
    pub investor: Address,
    pub arbiter: Address,
    pub challenge_period: u64,
    pub funded: bool,
    pub milestones: Vec<Milestone>,
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    LicenseNft,
    Splitter,
    Treasury,
    FeeBps,
    NextId,
    Project(u64),
    ByLicense(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidMilestones = 1,
    SplitNotConfigured = 2,
    ProjectNotFound = 3,
    AlreadyFunded = 4,
    NotFunded = 5,
    InvalidIndex = 6,
    WrongStatus = 7,
    PreviousNotSettled = 8,
    ChallengeWindowClosed = 9,
    ChallengeWindowOpen = 10,
    InvalidConfig = 11,
    InvalidShare = 12,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectCreated {
    #[topic]
    pub project_id: u64,
    #[topic]
    pub license_id: u64,
    pub total: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ProjectFunded {
    #[topic]
    pub project_id: u64,
    pub investor: Address,
    pub total: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneSubmitted {
    #[topic]
    pub project_id: u64,
    pub index: u32,
    pub proof_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneDisputed {
    #[topic]
    pub project_id: u64,
    pub index: u32,
    pub reason_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneReleased {
    #[topic]
    pub project_id: u64,
    pub index: u32,
    pub to_lab: i128,
    pub fee: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneSplit {
    #[topic]
    pub project_id: u64,
    pub index: u32,
    pub lab_bps: u32,
    pub to_lab: i128,
    pub refunded: i128,
    pub fee: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MilestoneRefunded {
    #[topic]
    pub project_id: u64,
    pub index: u32,
    pub amount: i128,
}

#[contract]
pub struct MilestoneEscrow;

#[contractimpl]
impl MilestoneEscrow {
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        license_nft: Address,
        splitter: Address,
        treasury: Address,
        fee_bps: u32,
    ) {
        if fee_bps as i128 > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidConfig);
        }
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::Token, &token);
        s.set(&DataKey::LicenseNft, &license_nft);
        s.set(&DataKey::Splitter, &splitter);
        s.set(&DataKey::Treasury, &treasury);
        s.set(&DataKey::FeeBps, &fee_bps);
        s.set(&DataKey::NextId, &1u64);
    }

    /// Créé par le titulaire de la licence (le labo / l'université).
    pub fn create_project(
        env: Env,
        license_id: u64,
        investor: Address,
        arbiter: Address,
        amounts: Vec<i128>,
        challenge_period: u64,
    ) -> u64 {
        let nft: Address = env.storage().instance().get(&DataKey::LicenseNft).unwrap();
        let lab = LicenseNftClient::new(&env, &nft).owner_of(&license_id);
        lab.require_auth();

        if !splitter(&env).is_configured(&license_id) {
            panic_with_error!(&env, Error::SplitNotConfigured);
        }
        if amounts.is_empty() || amounts.len() > MAX_MILESTONES || arbiter == investor {
            panic_with_error!(&env, Error::InvalidMilestones);
        }
        let mut milestones = Vec::new(&env);
        let mut total: i128 = 0;
        for amount in amounts.iter() {
            if amount <= 0 {
                panic_with_error!(&env, Error::InvalidMilestones);
            }
            total += amount;
            milestones.push_back(Milestone {
                amount,
                status: MilestoneStatus::Pending,
                proof_hash: None,
                submitted_at: 0,
                dispute_reason: None,
                lab_bps: 0,
            });
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        // Instance prolongée à part (voir ip_license_nft::mint).
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        save(
            &env,
            &Project {
                id,
                license_id,
                lab,
                investor,
                arbiter,
                challenge_period,
                funded: false,
                milestones,
            },
        );

        let key = DataKey::ByLicense(license_id);
        let mut ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or(Vec::new(&env));
        ids.push_back(id);
        env.storage().persistent().set(&key, &ids);
        bump(&env, &key);

        ProjectCreated {
            project_id: id,
            license_id,
            total,
        }
        .publish(&env);
        id
    }

    /// Dépose la totalité des fonds et émet les parts correspondantes.
    pub fn fund(env: Env, project_id: u64) {
        let mut project = load(&env, project_id);
        project.investor.require_auth();
        if project.funded {
            panic_with_error!(&env, Error::AlreadyFunded);
        }
        let total = total_of(&project);
        token(&env).transfer(&project.investor, &env.current_contract_address(), &total);
        splitter(&env).mint_shares(&project.license_id, &project.investor, &total);

        project.funded = true;
        save(&env, &project);
        ProjectFunded {
            project_id,
            investor: project.investor,
            total,
        }
        .publish(&env);
    }

    pub fn submit_milestone(env: Env, project_id: u64, index: u32, proof_hash: BytesN<32>) {
        let mut project = load(&env, project_id);
        project.lab.require_auth();
        if !project.funded {
            panic_with_error!(&env, Error::NotFunded);
        }
        let mut m = milestone(&env, &project, index);
        if m.status != MilestoneStatus::Pending {
            panic_with_error!(&env, Error::WrongStatus);
        }
        for i in 0..index {
            let prev = project.milestones.get_unchecked(i).status;
            if !is_settled(prev) {
                panic_with_error!(&env, Error::PreviousNotSettled);
            }
        }
        m.status = MilestoneStatus::Submitted;
        m.proof_hash = Some(proof_hash.clone());
        m.submitted_at = env.ledger().timestamp();
        project.milestones.set(index, m);
        save(&env, &project);

        MilestoneSubmitted {
            project_id,
            index,
            proof_hash,
        }
        .publish(&env);
    }

    pub fn dispute(env: Env, project_id: u64, index: u32, reason_hash: BytesN<32>) {
        let mut project = load(&env, project_id);
        project.investor.require_auth();
        let mut m = milestone(&env, &project, index);
        if m.status != MilestoneStatus::Submitted {
            panic_with_error!(&env, Error::WrongStatus);
        }
        if env.ledger().timestamp() >= m.submitted_at + project.challenge_period {
            panic_with_error!(&env, Error::ChallengeWindowClosed);
        }
        m.status = MilestoneStatus::Disputed;
        m.dispute_reason = Some(reason_hash.clone());
        project.milestones.set(index, m);
        save(&env, &project);

        MilestoneDisputed {
            project_id,
            index,
            reason_hash,
        }
        .publish(&env);
    }

    /// Sans contestation à la fin de la fenêtre : n'importe qui peut libérer.
    pub fn release(env: Env, project_id: u64, index: u32) {
        let project = load(&env, project_id);
        let m = milestone(&env, &project, index);
        if m.status != MilestoneStatus::Submitted {
            panic_with_error!(&env, Error::WrongStatus);
        }
        if env.ledger().timestamp() < m.submitted_at + project.challenge_period {
            panic_with_error!(&env, Error::ChallengeWindowOpen);
        }
        pay_lab(&env, project, index, m);
    }

    pub fn resolve(env: Env, project_id: u64, index: u32, approve: bool) {
        Self::resolve_partial(env, project_id, index, if approve { BPS_DENOMINATOR as u32 } else { 0 });
    }

    /// La recherche peut échouer sans faute : l'arbitre attribue `lab_bps` de
    /// la tranche au labo (travail réalisé) et rembourse le reste à
    /// l'investisseur, dont les parts sont réduites d'autant.
    pub fn resolve_partial(env: Env, project_id: u64, index: u32, lab_bps: u32) {
        let project = load(&env, project_id);
        project.arbiter.require_auth();
        let m = milestone(&env, &project, index);
        if m.status != MilestoneStatus::Disputed {
            panic_with_error!(&env, Error::WrongStatus);
        }
        if lab_bps as i128 > BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidShare);
        }
        match lab_bps {
            0 => {
                refund(&env, project, index, m);
            }
            b if b as i128 == BPS_DENOMINATOR => pay_lab(&env, project, index, m),
            _ => split(&env, project, index, m, lab_bps),
        }
    }

    /// Annulation d'un commun accord : les jalons non soumis sont remboursés.
    pub fn cancel(env: Env, project_id: u64) {
        let mut project = load(&env, project_id);
        project.lab.require_auth();
        project.investor.require_auth();
        if !project.funded {
            panic_with_error!(&env, Error::NotFunded);
        }
        for i in 0..project.milestones.len() {
            let m = project.milestones.get_unchecked(i);
            if m.status == MilestoneStatus::Pending {
                project = refund(&env, project, i, m);
            }
        }
    }

    pub fn get_project(env: Env, project_id: u64) -> Project {
        load(&env, project_id)
    }

    pub fn projects_by_license(env: Env, license_id: u64) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::ByLicense(license_id))
            .unwrap_or(Vec::new(&env))
    }

    pub fn total_projects(env: Env) -> u64 {
        let next: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        next - 1
    }
}

// ---------- Fonctions internes ----------

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn token(env: &Env) -> token::Client<'_> {
    let addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
    token::Client::new(env, &addr)
}

fn splitter(env: &Env) -> SplitterClient<'_> {
    let addr: Address = env.storage().instance().get(&DataKey::Splitter).unwrap();
    SplitterClient::new(env, &addr)
}

fn load(env: &Env, project_id: u64) -> Project {
    match env.storage().persistent().get(&DataKey::Project(project_id)) {
        Some(p) => p,
        None => panic_with_error!(env, Error::ProjectNotFound),
    }
}

fn save(env: &Env, project: &Project) {
    let key = DataKey::Project(project.id);
    env.storage().persistent().set(&key, project);
    bump(env, &key);
}

fn milestone(env: &Env, project: &Project, index: u32) -> Milestone {
    match project.milestones.get(index) {
        Some(m) => m,
        None => panic_with_error!(env, Error::InvalidIndex),
    }
}

fn total_of(project: &Project) -> i128 {
    project.milestones.iter().map(|m| m.amount).sum()
}

fn is_settled(status: MilestoneStatus) -> bool {
    matches!(
        status,
        MilestoneStatus::Released | MilestoneStatus::Refunded | MilestoneStatus::Split
    )
}

/// Verse `gross` au labo, commission de la plateforme déduite. Renvoie (net, commission).
fn transfer_to_lab(env: &Env, lab: &Address, gross: i128) -> (i128, i128) {
    let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();
    let fee = gross * fee_bps as i128 / BPS_DENOMINATOR;
    let t = token(env);
    let me = env.current_contract_address();
    if fee > 0 {
        let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
        t.transfer(&me, &treasury, &fee);
    }
    t.transfer(&me, lab, &(gross - fee));
    (gross - fee, fee)
}

/// Rembourse `amount` à l'investisseur et brûle les parts correspondantes.
fn refund_investor(env: &Env, project: &Project, amount: i128) {
    token(env).transfer(&env.current_contract_address(), &project.investor, &amount);
    // L'investisseur a pu revendre une partie de ses parts : on ne brûle que
    // ce qu'il détient encore, pour ne jamais bloquer un remboursement.
    let s = splitter(env);
    let burnable = s
        .shares_of(&project.license_id, &project.investor)
        .min(amount);
    if burnable > 0 {
        s.burn_shares(&project.license_id, &project.investor, &burnable);
    }
}

fn split(env: &Env, mut project: Project, index: u32, mut m: Milestone, lab_bps: u32) {
    let lab_gross = m.amount * lab_bps as i128 / BPS_DENOMINATOR;
    let refunded = m.amount - lab_gross;
    let (to_lab, fee) = transfer_to_lab(env, &project.lab, lab_gross);
    refund_investor(env, &project, refunded);

    m.status = MilestoneStatus::Split;
    m.lab_bps = lab_bps;
    project.milestones.set(index, m);
    save(env, &project);
    MilestoneSplit {
        project_id: project.id,
        index,
        lab_bps,
        to_lab,
        refunded,
        fee,
    }
    .publish(env);
}

fn pay_lab(env: &Env, mut project: Project, index: u32, mut m: Milestone) {
    let (to_lab, fee) = transfer_to_lab(env, &project.lab, m.amount);

    m.status = MilestoneStatus::Released;
    m.lab_bps = BPS_DENOMINATOR as u32;
    project.milestones.set(index, m);
    save(env, &project);
    MilestoneReleased {
        project_id: project.id,
        index,
        to_lab,
        fee,
    }
    .publish(env);
}

fn refund(env: &Env, mut project: Project, index: u32, mut m: Milestone) -> Project {
    refund_investor(env, &project, m.amount);

    m.status = MilestoneStatus::Refunded;
    let amount = m.amount;
    project.milestones.set(index, m);
    save(env, &project);
    MilestoneRefunded {
        project_id: project.id,
        index,
        amount,
    }
    .publish(env);
    project
}

#[cfg(test)]
mod test;
