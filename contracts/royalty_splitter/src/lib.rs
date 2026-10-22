//! Parts d'investissement et répartition des redevances.
//!
//! Pour chaque licence :
//! - des bénéficiaires fixes (université, inventeurs) reçoivent un pourcentage
//!   de chaque redevance ;
//! - la part « investisseurs » est répartie au prorata des parts détenues,
//!   via un accumulateur par part (coût constant quel que soit le nombre de
//!   détenteurs). Chacun retire ses gains quand il veut (`claim`).
//!
//! Les parts ne peuvent être détenues que par des adresses en liste blanche
//! (KYC) et l'admin peut les récupérer (clawback), sur le modèle des actifs
//! régulés de Stellar.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype,
    panic_with_error, token, Address, Env, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const BPS_DENOMINATOR: i128 = 10_000;
const ACC_SCALE: i128 = 1_000_000_000_000;
const MAX_FIXED_BENEFICIARIES: u32 = 10;

#[contractclient(name = "LicenseNftClient")]
pub trait LicenseNftInterface {
    fn owner_of(env: Env, id: u64) -> Address;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Beneficiary {
    pub addr: Address,
    pub bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitConfig {
    /// Université en premier : elle reçoit les arrondis et la part
    /// investisseurs tant qu'aucune part n'a été émise.
    pub fixed: Vec<Beneficiary>,
    pub investors_bps: u32,
}

#[contracttype]
enum DataKey {
    Admin,
    Token,
    Treasury,
    FeeBps,
    LicenseNft,
    Minter,
    Allowed(Address),
    Config(u64),
    TotalShares(u64),
    Shares(u64, Address),
    Acc(u64),
    Debt(u64, Address),
    Claimable(u64, Address),
    TotalRoyalties(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidConfig = 1,
    AlreadyConfigured = 2,
    NotConfigured = 3,
    NotAllowed = 4,
    InvalidAmount = 5,
    InsufficientShares = 6,
    NoMinter = 7,
    NothingToClaim = 8,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Configured {
    #[topic]
    pub license_id: u64,
    pub investors_bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesMinted {
    #[topic]
    pub license_id: u64,
    #[topic]
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesBurned {
    #[topic]
    pub license_id: u64,
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharesTransferred {
    #[topic]
    pub license_id: u64,
    pub from: Address,
    pub to: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoyaltyPaid {
    #[topic]
    pub license_id: u64,
    #[topic]
    pub payer: Address,
    pub amount: i128,
    pub fee: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub license_id: u64,
    #[topic]
    pub who: Address,
    pub amount: i128,
}

#[contract]
pub struct RoyaltySplitter;

#[contractimpl]
impl RoyaltySplitter {
    pub fn __constructor(
        env: Env,
        admin: Address,
        token: Address,
        license_nft: Address,
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
        s.set(&DataKey::Treasury, &treasury);
        s.set(&DataKey::FeeBps, &fee_bps);
    }

    // ---------- Administration ----------

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn token(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }

    /// L'émetteur de parts autorisé : le contrat d'escrow.
    pub fn set_minter(env: Env, minter: Address) {
        Self::admin(env.clone()).require_auth();
        env.storage().instance().set(&DataKey::Minter, &minter);
    }

    /// Liste blanche KYC.
    pub fn set_allowed(env: Env, who: Address, allowed: bool) {
        Self::admin(env.clone()).require_auth();
        let key = DataKey::Allowed(who);
        if allowed {
            env.storage().persistent().set(&key, &true);
            bump(&env, &key);
        } else {
            env.storage().persistent().remove(&key);
        }
    }

    pub fn is_allowed(env: Env, who: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Allowed(who))
            .unwrap_or(false)
    }

    // ---------- Configuration d'une licence ----------

    /// Fixée une seule fois par le titulaire de la licence.
    pub fn configure(env: Env, license_id: u64, config: SplitConfig) {
        let nft: Address = env.storage().instance().get(&DataKey::LicenseNft).unwrap();
        let owner = LicenseNftClient::new(&env, &nft).owner_of(&license_id);
        owner.require_auth();

        let key = DataKey::Config(license_id);
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::AlreadyConfigured);
        }
        let n = config.fixed.len();
        if n == 0 || n > MAX_FIXED_BENEFICIARIES {
            panic_with_error!(&env, Error::InvalidConfig);
        }
        let mut total = config.investors_bps as i128;
        for b in config.fixed.iter() {
            total += b.bps as i128;
        }
        if total != BPS_DENOMINATOR {
            panic_with_error!(&env, Error::InvalidConfig);
        }

        env.storage().persistent().set(&key, &config);
        bump(&env, &key);
        Configured {
            license_id,
            investors_bps: config.investors_bps,
        }
        .publish(&env);
    }

    pub fn is_configured(env: Env, license_id: u64) -> bool {
        env.storage().persistent().has(&DataKey::Config(license_id))
    }

    pub fn get_config(env: Env, license_id: u64) -> SplitConfig {
        config(&env, license_id)
    }

    // ---------- Parts ----------

    pub fn mint_shares(env: Env, license_id: u64, to: Address, amount: i128) {
        minter(&env).require_auth();
        config(&env, license_id);
        positive(&env, amount);
        require_allowed(&env, &to);

        settle(&env, license_id, &to);
        let shares = Self::shares_of(env.clone(), license_id, to.clone()) + amount;
        set_shares(&env, license_id, &to, shares);
        set_total(&env, license_id, total_shares(&env, license_id) + amount);
        reset_debt(&env, license_id, &to);

        SharesMinted {
            license_id,
            to,
            amount,
        }
        .publish(&env);
    }

    /// Appelé par l'escrow quand une tranche est remboursée à l'investisseur.
    pub fn burn_shares(env: Env, license_id: u64, from: Address, amount: i128) {
        minter(&env).require_auth();
        burn(&env, license_id, &from, amount);
    }

    /// Clawback réglementaire (décision de justice, erreur).
    pub fn clawback(env: Env, license_id: u64, from: Address, amount: i128) {
        Self::admin(env.clone()).require_auth();
        burn(&env, license_id, &from, amount);
    }

    pub fn transfer_shares(env: Env, license_id: u64, from: Address, to: Address, amount: i128) {
        from.require_auth();
        positive(&env, amount);
        require_allowed(&env, &from);
        require_allowed(&env, &to);

        settle(&env, license_id, &from);
        settle(&env, license_id, &to);
        let from_shares = Self::shares_of(env.clone(), license_id, from.clone());
        if from_shares < amount {
            panic_with_error!(&env, Error::InsufficientShares);
        }
        set_shares(&env, license_id, &from, from_shares - amount);
        let to_shares = Self::shares_of(env.clone(), license_id, to.clone());
        set_shares(&env, license_id, &to, to_shares + amount);
        reset_debt(&env, license_id, &from);
        reset_debt(&env, license_id, &to);

        SharesTransferred {
            license_id,
            from,
            to,
            amount,
        }
        .publish(&env);
    }

    pub fn shares_of(env: Env, license_id: u64, who: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Shares(license_id, who))
            .unwrap_or(0)
    }

    pub fn total_shares(env: Env, license_id: u64) -> i128 {
        total_shares(&env, license_id)
    }

    // ---------- Redevances ----------

    pub fn pay_royalty(env: Env, license_id: u64, payer: Address, amount: i128) {
        payer.require_auth();
        positive(&env, amount);
        let cfg = config(&env, license_id);

        let token = token::Client::new(&env, &Self::token(env.clone()));
        token.transfer(&payer, &env.current_contract_address(), &amount);

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();
        let fee = amount * fee_bps as i128 / BPS_DENOMINATOR;
        if fee > 0 {
            let treasury: Address = env.storage().instance().get(&DataKey::Treasury).unwrap();
            token.transfer(&env.current_contract_address(), &treasury, &fee);
        }
        let net = amount - fee;

        let mut distributed: i128 = 0;
        for b in cfg.fixed.iter() {
            let part = net * b.bps as i128 / BPS_DENOMINATOR;
            add_claimable(&env, license_id, &b.addr, part);
            distributed += part;
        }

        let first = cfg.fixed.get_unchecked(0).addr;
        let investors_part = net * cfg.investors_bps as i128 / BPS_DENOMINATOR;
        let total = total_shares(&env, license_id);
        if investors_part > 0 && total > 0 {
            let key = DataKey::Acc(license_id);
            let acc: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage()
                .persistent()
                .set(&key, &(acc + investors_part * ACC_SCALE / total));
            bump(&env, &key);
        } else {
            add_claimable(&env, license_id, &first, investors_part);
        }
        distributed += investors_part;

        // Arrondis au premier bénéficiaire fixe.
        add_claimable(&env, license_id, &first, net - distributed);

        let key = DataKey::TotalRoyalties(license_id);
        let paid: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(paid + amount));
        bump(&env, &key);

        RoyaltyPaid {
            license_id,
            payer,
            amount,
            fee,
        }
        .publish(&env);
    }

    pub fn claimable(env: Env, license_id: u64, who: Address) -> i128 {
        stored_claimable(&env, license_id, &who) + pending(&env, license_id, &who)
    }

    pub fn claim(env: Env, license_id: u64, who: Address) -> i128 {
        who.require_auth();
        settle(&env, license_id, &who);
        let amount = stored_claimable(&env, license_id, &who);
        if amount <= 0 {
            panic_with_error!(&env, Error::NothingToClaim);
        }
        env.storage()
            .persistent()
            .remove(&DataKey::Claimable(license_id, who.clone()));
        token::Client::new(&env, &Self::token(env.clone())).transfer(
            &env.current_contract_address(),
            &who,
            &amount,
        );
        Claimed {
            license_id,
            who,
            amount,
        }
        .publish(&env);
        amount
    }

    pub fn total_royalties(env: Env, license_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::TotalRoyalties(license_id))
            .unwrap_or(0)
    }
}

// ---------- Fonctions internes ----------

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn positive(env: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(env, Error::InvalidAmount);
    }
}

fn config(env: &Env, license_id: u64) -> SplitConfig {
    match env.storage().persistent().get(&DataKey::Config(license_id)) {
        Some(c) => c,
        None => panic_with_error!(env, Error::NotConfigured),
    }
}

fn minter(env: &Env) -> Address {
    match env.storage().instance().get(&DataKey::Minter) {
        Some(m) => m,
        None => panic_with_error!(env, Error::NoMinter),
    }
}

fn require_allowed(env: &Env, who: &Address) {
    if !RoyaltySplitter::is_allowed(env.clone(), who.clone()) {
        panic_with_error!(env, Error::NotAllowed);
    }
}

fn total_shares(env: &Env, license_id: u64) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::TotalShares(license_id))
        .unwrap_or(0)
}

fn set_total(env: &Env, license_id: u64, total: i128) {
    let key = DataKey::TotalShares(license_id);
    env.storage().persistent().set(&key, &total);
    bump(env, &key);
}

fn set_shares(env: &Env, license_id: u64, who: &Address, shares: i128) {
    let key = DataKey::Shares(license_id, who.clone());
    if shares == 0 {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, &shares);
        bump(env, &key);
    }
}

fn acc(env: &Env, license_id: u64) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Acc(license_id))
        .unwrap_or(0)
}

fn debt(env: &Env, license_id: u64, who: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Debt(license_id, who.clone()))
        .unwrap_or(0)
}

/// Gains accumulés par les parts de `who` et pas encore réglés.
fn pending(env: &Env, license_id: u64, who: &Address) -> i128 {
    let shares = RoyaltySplitter::shares_of(env.clone(), license_id, who.clone());
    shares * acc(env, license_id) / ACC_SCALE - debt(env, license_id, who)
}

fn reset_debt(env: &Env, license_id: u64, who: &Address) {
    let shares = RoyaltySplitter::shares_of(env.clone(), license_id, who.clone());
    let key = DataKey::Debt(license_id, who.clone());
    let value = shares * acc(env, license_id) / ACC_SCALE;
    if value == 0 {
        env.storage().persistent().remove(&key);
    } else {
        env.storage().persistent().set(&key, &value);
        bump(env, &key);
    }
}

/// Convertit les gains en attente en montant retirable.
fn settle(env: &Env, license_id: u64, who: &Address) {
    let p = pending(env, license_id, who);
    if p > 0 {
        add_claimable(env, license_id, who, p);
    }
    reset_debt(env, license_id, who);
}

fn stored_claimable(env: &Env, license_id: u64, who: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Claimable(license_id, who.clone()))
        .unwrap_or(0)
}

fn add_claimable(env: &Env, license_id: u64, who: &Address, amount: i128) {
    if amount <= 0 {
        return;
    }
    let key = DataKey::Claimable(license_id, who.clone());
    let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
    env.storage().persistent().set(&key, &(current + amount));
    bump(env, &key);
}

fn burn(env: &Env, license_id: u64, from: &Address, amount: i128) {
    positive(env, amount);
    settle(env, license_id, from);
    let shares = RoyaltySplitter::shares_of(env.clone(), license_id, from.clone());
    if shares < amount {
        panic_with_error!(env, Error::InsufficientShares);
    }
    set_shares(env, license_id, from, shares - amount);
    set_total(env, license_id, total_shares(env, license_id) - amount);
    reset_debt(env, license_id, from);
    SharesBurned {
        license_id,
        from: from.clone(),
        amount,
    }
    .publish(env);
}

#[cfg(test)]
mod test;
