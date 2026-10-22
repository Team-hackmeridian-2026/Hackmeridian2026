use super::*;
use ip_license_nft::{IpLicenseNft, IpLicenseNftClient, LicenseTerms};
use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, token::TokenClient, vec, BytesN, Env,
    String,
};

struct Setup<'a> {
    env: Env,
    splitter: RoyaltySplitterClient<'a>,
    token: TokenClient<'a>,
    token_admin: StellarAssetClient<'a>,
    university: Address,
    inventor: Address,
    minter: Address,
    treasury: Address,
    license_id: u64,
}

fn setup(fee_bps: u32) -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let university = Address::generate(&env);
    let inventor = Address::generate(&env);
    let treasury = Address::generate(&env);
    let minter = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let nft_id = env.register(IpLicenseNft, (admin.clone(),));
    let nft = IpLicenseNftClient::new(&env, &nft_id);
    nft.set_institution(&university, &true);
    let license_id = nft.mint(
        &university,
        &String::from_str(&env, "Anti-X antibody"),
        &vec![&env, inventor.clone()],
        &LicenseTerms {
            exclusive: true,
            territory: String::from_str(&env, "EU"),
            field: String::from_str(&env, "Oncology"),
            duration_years: 10,
        },
        &BytesN::from_array(&env, &[1; 32]),
        &String::from_str(&env, ""),
    );

    let splitter_id = env.register(
        RoyaltySplitter,
        (
            admin.clone(),
            sac.address(),
            nft_id,
            treasury.clone(),
            fee_bps,
        ),
    );
    let splitter = RoyaltySplitterClient::new(&env, &splitter_id);
    splitter.set_minter(&minter);

    Setup {
        env,
        splitter,
        token,
        token_admin,
        university,
        inventor,
        minter,
        treasury,
        license_id,
    }
}

/// Université 40 %, inventeur 30 %, investisseurs 30 %.
fn configure(s: &Setup) {
    s.splitter.configure(
        &s.license_id,
        &SplitConfig {
            fixed: vec![
                &s.env,
                Beneficiary {
                    addr: s.university.clone(),
                    bps: 4_000,
                },
                Beneficiary {
                    addr: s.inventor.clone(),
                    bps: 3_000,
                },
            ],
            investors_bps: 3_000,
        },
    );
}

fn investor(s: &Setup, shares: i128) -> Address {
    let who = Address::generate(&s.env);
    s.splitter.set_allowed(&who, &true);
    if shares > 0 {
        s.splitter.mint_shares(&s.license_id, &who, &shares);
    }
    who
}

fn pay(s: &Setup, amount: i128) -> Address {
    let payer = Address::generate(&s.env);
    s.token_admin.mint(&payer, &amount);
    s.splitter.pay_royalty(&s.license_id, &payer, &amount);
    payer
}

#[test]
fn config_must_sum_to_100_percent() {
    let s = setup(0);
    let result = s.splitter.try_configure(
        &s.license_id,
        &SplitConfig {
            fixed: vec![
                &s.env,
                Beneficiary {
                    addr: s.university.clone(),
                    bps: 5_000,
                },
            ],
            investors_bps: 4_000,
        },
    );
    assert_eq!(result, Err(Ok(Error::InvalidConfig.into())));

    configure(&s);
    assert!(s.splitter.is_configured(&s.license_id));
    assert_eq!(
        s.splitter.try_get_config(&(s.license_id + 1)),
        Err(Ok(Error::NotConfigured.into()))
    );
}

#[test]
fn cannot_configure_twice() {
    let s = setup(0);
    configure(&s);
    let again = s.splitter.try_configure(&s.license_id, &s.splitter.get_config(&s.license_id));
    assert_eq!(again, Err(Ok(Error::AlreadyConfigured.into())));
}

#[test]
fn royalty_split_pro_rata() {
    let s = setup(0);
    configure(&s);
    let a = investor(&s, 300);
    let b = investor(&s, 100);

    pay(&s, 10_000);

    assert_eq!(s.splitter.claimable(&s.license_id, &s.university), 4_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.inventor), 3_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &a), 2_250);
    assert_eq!(s.splitter.claimable(&s.license_id, &b), 750);
    assert_eq!(s.splitter.total_royalties(&s.license_id), 10_000);

    assert_eq!(s.splitter.claim(&s.license_id, &a), 2_250);
    assert_eq!(s.token.balance(&a), 2_250);
    assert_eq!(s.splitter.claimable(&s.license_id, &a), 0);
    assert_eq!(
        s.splitter.try_claim(&s.license_id, &a),
        Err(Ok(Error::NothingToClaim.into()))
    );
}

#[test]
fn without_shares_investor_part_goes_to_university() {
    let s = setup(0);
    configure(&s);
    pay(&s, 10_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.university), 7_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.inventor), 3_000);
}

#[test]
fn transfer_keeps_past_earnings_with_seller() {
    let s = setup(0);
    configure(&s);
    let a = investor(&s, 100);
    let b = investor(&s, 0);

    pay(&s, 10_000); // a gagne 3 000
    s.splitter.transfer_shares(&s.license_id, &a, &b, &100);
    pay(&s, 10_000); // b gagne 3 000

    assert_eq!(s.splitter.shares_of(&s.license_id, &a), 0);
    assert_eq!(s.splitter.shares_of(&s.license_id, &b), 100);
    assert_eq!(s.splitter.claimable(&s.license_id, &a), 3_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &b), 3_000);
}

#[test]
fn shares_restricted_to_allowed_addresses() {
    let s = setup(0);
    configure(&s);
    let stranger = Address::generate(&s.env);
    assert_eq!(
        s.splitter.try_mint_shares(&s.license_id, &stranger, &10),
        Err(Ok(Error::NotAllowed.into()))
    );

    let a = investor(&s, 10);
    assert_eq!(
        s.splitter.try_transfer_shares(&s.license_id, &a, &stranger, &5),
        Err(Ok(Error::NotAllowed.into()))
    );
    assert_eq!(
        s.splitter.try_transfer_shares(&s.license_id, &a, &a, &50),
        Err(Ok(Error::InsufficientShares.into()))
    );
}

#[test]
fn clawback_burns_shares_but_keeps_earned_royalties() {
    let s = setup(0);
    configure(&s);
    let a = investor(&s, 100);
    let b = investor(&s, 100);

    pay(&s, 10_000);
    s.splitter.clawback(&s.license_id, &a, &100);
    assert_eq!(s.splitter.total_shares(&s.license_id), 100);

    pay(&s, 10_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &a), 1_500);
    assert_eq!(s.splitter.claimable(&s.license_id, &b), 4_500);
}

#[test]
fn platform_fee_goes_to_treasury() {
    let s = setup(100); // 1 %
    configure(&s);
    investor(&s, 1);
    pay(&s, 10_000);

    assert_eq!(s.token.balance(&s.treasury), 100);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.university), 3_960);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.inventor), 2_970);
}

#[test]
fn rounding_dust_goes_to_first_beneficiary() {
    let s = setup(0);
    configure(&s);
    pay(&s, 7);
    // 7 * 40 % = 2, 7 * 30 % = 2, part investisseurs 2 -> université, reste 1 -> université
    assert_eq!(s.splitter.claimable(&s.license_id, &s.university), 5);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.inventor), 2);
    assert_eq!(s.token.balance(&s.splitter.address), 7);
}

#[test]
fn only_minter_can_mint() {
    let s = setup(0);
    configure(&s);
    let a = investor(&s, 0);
    s.splitter.mint_shares(&s.license_id, &a, &5);
    let auths = s.env.auths();
    assert_eq!(auths[0].0, s.minter);
}
