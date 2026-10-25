//! IP-NFT de licence.
//!
//! Chaque jeton représente un contrat de licence sur un brevet : l'université
//! (ou le labo) en reste titulaire, le jeton porte les termes de la licence et
//! l'empreinte SHA-256 du dossier scientifique stocké hors chaîne.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    Address, BytesN, Env, String, Vec,
};

const DAY_IN_LEDGERS: u32 = 17_280;
const TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
const TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
const MAX_PAGE: u32 = 50;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicenseTerms {
    pub exclusive: bool,
    pub territory: String,
    pub field: String,
    pub duration_years: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct License {
    pub id: u64,
    pub owner: Address,
    pub title: String,
    pub inventors: Vec<Address>,
    pub terms: LicenseTerms,
    pub dossier_hash: BytesN<32>,
    pub metadata_uri: String,
    pub created_at: u64,
}

#[contracttype]
enum DataKey {
    Admin,
    NextId,
    Institution(Address),
    License(u64),
    Nda(u64, Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInstitution = 1,
    LicenseNotFound = 2,
    NdaAlreadySigned = 3,
    InvalidTerms = 4,
    NotOwner = 5,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicenseMinted {
    #[topic]
    pub id: u64,
    #[topic]
    pub owner: Address,
    pub dossier_hash: BytesN<32>,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LicenseTransferred {
    #[topic]
    pub id: u64,
    pub from: Address,
    pub to: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NdaSigned {
    #[topic]
    pub id: u64,
    #[topic]
    pub viewer: Address,
    pub signed_at: u64,
}

#[contract]
pub struct IpLicenseNft;

#[contractimpl]
impl IpLicenseNft {
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::NextId, &1u64);
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    /// Déclare une adresse comme institution vérifiée (université, labo, TTO).
    pub fn set_institution(env: Env, institution: Address, verified: bool) {
        Self::admin(env.clone()).require_auth();
        let key = DataKey::Institution(institution);
        if verified {
            env.storage().persistent().set(&key, &true);
            bump(&env, &key);
        } else {
            env.storage().persistent().remove(&key);
        }
    }

    pub fn is_institution(env: Env, who: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Institution(who))
            .unwrap_or(false)
    }

    pub fn mint(
        env: Env,
        owner: Address,
        title: String,
        inventors: Vec<Address>,
        terms: LicenseTerms,
        dossier_hash: BytesN<32>,
        metadata_uri: String,
    ) -> u64 {
        owner.require_auth();
        if !Self::is_institution(env.clone(), owner.clone()) {
            panic_with_error!(&env, Error::NotInstitution);
        }
        if title.is_empty() || inventors.is_empty() || terms.duration_years == 0 {
            panic_with_error!(&env, Error::InvalidTerms);
        }

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        let license = License {
            id,
            owner: owner.clone(),
            title,
            inventors,
            terms,
            dossier_hash: dossier_hash.clone(),
            metadata_uri,
            created_at: env.ledger().timestamp(),
        };
        let key = DataKey::License(id);
        env.storage().persistent().set(&key, &license);
        bump(&env, &key);
        // Pas d'extend_ttl sur l'instance ici : elle prolonge aussi le code du
        // contrat et coûtait ~1 000 XLM de loyer par appel sur le testnet.
        // L'instance se prolonge à part avec `stellar contract extend`.
        env.storage().instance().set(&DataKey::NextId, &(id + 1));

        LicenseMinted {
            id,
            owner,
            dossier_hash,
        }
        .publish(&env);
        id
    }

    pub fn get_license(env: Env, id: u64) -> License {
        let key = DataKey::License(id);
        match env.storage().persistent().get(&key) {
            Some(license) => license,
            None => panic_with_error!(&env, Error::LicenseNotFound),
        }
    }

    pub fn owner_of(env: Env, id: u64) -> Address {
        Self::get_license(env, id).owner
    }

    pub fn total(env: Env) -> u64 {
        let next: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        next - 1
    }

    /// Licences `start..start+limit` (les identifiants commencent à 1).
    pub fn list_licenses(env: Env, start: u64, limit: u32) -> Vec<License> {
        let next: u64 = env.storage().instance().get(&DataKey::NextId).unwrap();
        let start = start.max(1);
        let end = next.min(start.saturating_add(limit.min(MAX_PAGE) as u64));
        let mut out = Vec::new(&env);
        for id in start..end {
            if let Some(license) = env.storage().persistent().get(&DataKey::License(id)) {
                out.push_back(license);
            }
        }
        out
    }

    /// La licence ne peut être cédée qu'à une autre institution vérifiée.
    pub fn transfer(env: Env, id: u64, from: Address, to: Address) {
        from.require_auth();
        let mut license = Self::get_license(env.clone(), id);
        if license.owner != from {
            panic_with_error!(&env, Error::NotOwner);
        }
        if !Self::is_institution(env.clone(), to.clone()) {
            panic_with_error!(&env, Error::NotInstitution);
        }
        license.owner = to.clone();
        let key = DataKey::License(id);
        env.storage().persistent().set(&key, &license);
        bump(&env, &key);
        LicenseTransferred { id, from, to }.publish(&env);
    }

    /// Trace on-chain l'acceptation de l'accord de confidentialité avant
    /// l'accès à la data room chiffrée.
    pub fn sign_nda(env: Env, id: u64, viewer: Address) {
        viewer.require_auth();
        Self::get_license(env.clone(), id);
        let key = DataKey::Nda(id, viewer.clone());
        if env.storage().persistent().has(&key) {
            panic_with_error!(&env, Error::NdaAlreadySigned);
        }
        let signed_at = env.ledger().timestamp();
        env.storage().persistent().set(&key, &signed_at);
        bump(&env, &key);
        NdaSigned {
            id,
            viewer,
            signed_at,
        }
        .publish(&env);
    }

    pub fn has_signed_nda(env: Env, id: u64, viewer: Address) -> bool {
        env.storage().persistent().has(&DataKey::Nda(id, viewer))
    }
}

fn bump(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

#[cfg(test)]
mod test;
