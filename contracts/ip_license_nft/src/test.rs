use super::*;
use soroban_sdk::{testutils::Address as _, vec, Env};

struct Setup<'a> {
    env: Env,
    client: IpLicenseNftClient<'a>,
    university: Address,
    inventor: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(IpLicenseNft, (admin,));
    let client = IpLicenseNftClient::new(&env, &id);
    let university = Address::generate(&env);
    let inventor = Address::generate(&env);
    client.set_institution(&university, &true);
    Setup {
        env,
        client,
        university,
        inventor,
    }
}

fn terms(env: &Env) -> LicenseTerms {
    LicenseTerms {
        exclusive: true,
        territory: String::from_str(env, "EU"),
        field: String::from_str(env, "Oncology"),
        duration_years: 10,
    }
}

fn mint(s: &Setup) -> u64 {
    s.client.mint(
        &s.university,
        &String::from_str(&s.env, "Anti-X antibody"),
        &vec![&s.env, s.inventor.clone()],
        &terms(&s.env),
        &BytesN::from_array(&s.env, &[7; 32]),
        &String::from_str(&s.env, "ipfs://dossier"),
    )
}

#[test]
fn mint_and_read() {
    let s = setup();
    assert_eq!(mint(&s), 1);
    assert_eq!(mint(&s), 2);

    let license = s.client.get_license(&1);
    assert_eq!(license.owner, s.university);
    assert_eq!(license.terms, terms(&s.env));
    assert_eq!(s.client.total(), 2);
    assert_eq!(s.client.list_licenses(&1, &10).len(), 2);
    assert_eq!(s.client.list_licenses(&2, &10).len(), 1);
}

#[test]
fn unverified_owner_cannot_mint() {
    let s = setup();
    let stranger = Address::generate(&s.env);
    let result = s.client.try_mint(
        &stranger,
        &String::from_str(&s.env, "X"),
        &vec![&s.env, s.inventor.clone()],
        &terms(&s.env),
        &BytesN::from_array(&s.env, &[0; 32]),
        &String::from_str(&s.env, ""),
    );
    assert_eq!(result, Err(Ok(Error::NotInstitution.into())));
}

#[test]
fn transfer_only_to_institution() {
    let s = setup();
    let id = mint(&s);
    let other_uni = Address::generate(&s.env);

    let result = s.client.try_transfer(&id, &s.university, &other_uni);
    assert_eq!(result, Err(Ok(Error::NotInstitution.into())));

    s.client.set_institution(&other_uni, &true);
    s.client.transfer(&id, &s.university, &other_uni);
    assert_eq!(s.client.owner_of(&id), other_uni);

    let result = s.client.try_transfer(&id, &s.university, &other_uni);
    assert_eq!(result, Err(Ok(Error::NotOwner.into())));
}

#[test]
fn nda_signed_once() {
    let s = setup();
    let id = mint(&s);
    let investor = Address::generate(&s.env);

    assert!(!s.client.has_signed_nda(&id, &investor));
    s.client.sign_nda(&id, &investor);
    assert!(s.client.has_signed_nda(&id, &investor));
    assert_eq!(
        s.client.try_sign_nda(&id, &investor),
        Err(Ok(Error::NdaAlreadySigned.into()))
    );
}

#[test]
fn unknown_license() {
    let s = setup();
    assert_eq!(
        s.client.try_get_license(&42),
        Err(Ok(Error::LicenseNotFound.into()))
    );
}
