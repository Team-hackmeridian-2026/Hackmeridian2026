use super::*;
use ip_license_nft::{IpLicenseNft, IpLicenseNftClient, LicenseTerms};
use royalty_splitter::{Beneficiary, RoyaltySplitter, RoyaltySplitterClient, SplitConfig};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, String,
};

const WINDOW: u64 = 60;
/// Research period of the test projects: one year after creation (ledger time 0).
const DEADLINE: u64 = 365 * 24 * 60 * 60;
/// Same as ARBITER_PERIOD in the contract.
const ARBITER_PERIOD: u64 = 30 * 24 * 60 * 60;

struct Setup<'a> {
    env: Env,
    escrow: MilestoneEscrowClient<'a>,
    splitter: RoyaltySplitterClient<'a>,
    token: TokenClient<'a>,
    token_admin: StellarAssetClient<'a>,
    lab: Address,
    inventor: Address,
    investor: Address,
    arbiter: Address,
    treasury: Address,
    license_id: u64,
}

fn setup(fee_bps: u32) -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let lab = Address::generate(&env);
    let inventor = Address::generate(&env);
    let investor = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let treasury = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());
    token_admin.mint(&investor, &1_000_000);

    let nft_id = env.register(IpLicenseNft, (admin.clone(),));
    let nft = IpLicenseNftClient::new(&env, &nft_id);
    nft.set_institution(&lab, &true);
    let license_id = nft.mint(
        &lab,
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
            nft_id.clone(),
            treasury.clone(),
            0u32,
        ),
    );
    let splitter = RoyaltySplitterClient::new(&env, &splitter_id);

    let escrow_id = env.register(
        MilestoneEscrow,
        (
            admin.clone(),
            sac.address(),
            nft_id,
            splitter_id.clone(),
            treasury.clone(),
            fee_bps,
        ),
    );
    let escrow = MilestoneEscrowClient::new(&env, &escrow_id);

    splitter.set_minter(&escrow_id);
    splitter.set_allowed(&investor, &true);
    splitter.configure(
        &license_id,
        &SplitConfig {
            fixed: vec![
                &env,
                Beneficiary {
                    addr: lab.clone(),
                    bps: 4_000,
                },
                Beneficiary {
                    addr: inventor.clone(),
                    bps: 3_000,
                },
            ],
            investors_bps: 3_000,
        },
    );

    Setup {
        env,
        escrow,
        splitter,
        token,
        token_admin,
        lab,
        inventor,
        investor,
        arbiter,
        treasury,
        license_id,
    }
}

fn create(s: &Setup) -> u64 {
    s.escrow.create_project(
        &s.license_id,
        &s.investor,
        &s.arbiter,
        &vec![&s.env, 10_000i128, 10_000, 10_000],
        &WINDOW,
        &DEADLINE,
    )
}

fn proof(s: &Setup, byte: u8) -> BytesN<32> {
    BytesN::from_array(&s.env, &[byte; 32])
}

fn advance(s: &Setup, seconds: u64) {
    s.env.ledger().with_mut(|l| l.timestamp += seconds);
}

fn status(s: &Setup, pid: u64, index: u32) -> MilestoneStatus {
    s.escrow.get_project(&pid).milestones.get_unchecked(index).status
}

/// Le scénario exact de la démo.
#[test]
fn demo_scenario_end_to_end() {
    let s = setup(0);
    let pid = create(&s);
    assert_eq!(s.escrow.projects_by_license(&s.license_id), vec![&s.env, pid]);

    s.escrow.fund(&pid);
    assert_eq!(s.token.balance(&s.escrow.address), 30_000);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 30_000);

    s.escrow.submit_milestone(&pid, &0, &proof(&s, 9));
    assert_eq!(
        s.escrow.try_release(&pid, &0),
        Err(Ok(Error::ChallengeWindowOpen.into()))
    );
    advance(&s, WINDOW);
    s.escrow.release(&pid, &0);
    assert_eq!(s.token.balance(&s.lab), 10_000);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Released);

    let pharma = Address::generate(&s.env);
    s.token_admin.mint(&pharma, &5_000);
    s.splitter.pay_royalty(&s.license_id, &pharma, &5_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.lab), 2_000);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.inventor), 1_500);
    assert_eq!(s.splitter.claimable(&s.license_id, &s.investor), 1_500);
}

#[test]
fn fee_goes_to_treasury_on_release() {
    let s = setup(250); // 2,5 %
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    advance(&s, WINDOW);
    s.escrow.release(&pid, &0);
    assert_eq!(s.token.balance(&s.treasury), 250);
    assert_eq!(s.token.balance(&s.lab), 9_750);
}

#[test]
fn milestones_in_order() {
    let s = setup(0);
    let pid = create(&s);
    assert_eq!(
        s.escrow.try_submit_milestone(&pid, &0, &proof(&s, 1)),
        Err(Ok(Error::NotFunded.into()))
    );
    s.escrow.fund(&pid);
    assert_eq!(
        s.escrow.try_submit_milestone(&pid, &1, &proof(&s, 1)),
        Err(Ok(Error::PreviousNotSettled.into()))
    );
    assert_eq!(
        s.escrow.try_submit_milestone(&pid, &5, &proof(&s, 1)),
        Err(Ok(Error::InvalidIndex.into()))
    );
    assert_eq!(s.escrow.try_fund(&pid), Err(Ok(Error::AlreadyFunded.into())));
}

#[test]
fn dispute_then_arbiter_approves() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    s.escrow.dispute(&pid, &0, &proof(&s, 2));
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Disputed);

    advance(&s, WINDOW);
    assert_eq!(s.escrow.try_release(&pid, &0), Err(Ok(Error::WrongStatus.into())));

    s.escrow.resolve(&pid, &0, &true);
    assert_eq!(s.token.balance(&s.lab), 10_000);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Released);
}

fn disputed(s: &Setup) -> u64 {
    let pid = create(s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(s, 1));
    s.escrow.dispute(&pid, &0, &proof(s, 2));
    pid
}

#[test]
fn arbiter_splits_a_milestone_after_a_good_faith_failure() {
    let s = setup(0);
    let pid = disputed(&s);

    s.escrow.resolve_partial(&pid, &0, &6_000); // 60 % au labo
    let m = s.escrow.get_project(&pid).milestones.get_unchecked(0);
    assert_eq!(m.status, MilestoneStatus::Split);
    assert_eq!(m.lab_bps, 6_000);
    assert_eq!(s.token.balance(&s.lab), 6_000);
    assert_eq!(s.token.balance(&s.investor), 1_000_000 - 30_000 + 4_000);
    assert_eq!(s.token.balance(&s.escrow.address), 20_000);
    // Les parts suivent l'argent réellement engagé.
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 26_000);

    // Un jalon partagé est réglé : le suivant peut être soumis.
    s.escrow.submit_milestone(&pid, &1, &proof(&s, 3));
}

#[test]
fn split_fee_only_applies_to_the_lab_share() {
    let s = setup(250); // 2,5 %
    let pid = disputed(&s);
    s.escrow.resolve_partial(&pid, &0, &5_000);
    assert_eq!(s.token.balance(&s.treasury), 125);
    assert_eq!(s.token.balance(&s.lab), 4_875);
    assert_eq!(s.token.balance(&s.investor), 1_000_000 - 30_000 + 5_000);
}

#[test]
fn split_extremes_match_approve_and_refund() {
    let s = setup(0);
    let pid = disputed(&s);
    s.escrow.resolve_partial(&pid, &0, &10_000);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Released);
    assert_eq!(s.token.balance(&s.lab), 10_000);

    s.escrow.submit_milestone(&pid, &1, &proof(&s, 3));
    s.escrow.dispute(&pid, &1, &proof(&s, 4));
    s.escrow.resolve_partial(&pid, &1, &0);
    assert_eq!(status(&s, pid, 1), MilestoneStatus::Refunded);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 20_000);
}

#[test]
fn split_rejects_invalid_shares_and_undisputed_milestones() {
    let s = setup(0);
    let pid = disputed(&s);
    assert_eq!(
        s.escrow.try_resolve_partial(&pid, &0, &10_001),
        Err(Ok(Error::InvalidShare.into()))
    );

    let other = create(&s);
    s.escrow.fund(&other);
    s.escrow.submit_milestone(&other, &0, &proof(&s, 1));
    assert_eq!(
        s.escrow.try_resolve_partial(&other, &0, &5_000),
        Err(Ok(Error::WrongStatus.into()))
    );
}

#[test]
fn dispute_then_arbiter_refunds_and_burns_shares() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    s.escrow.dispute(&pid, &0, &proof(&s, 2));
    s.escrow.resolve(&pid, &0, &false);

    assert_eq!(status(&s, pid, 0), MilestoneStatus::Refunded);
    assert_eq!(s.token.balance(&s.investor), 1_000_000 - 20_000);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 20_000);

    // Le jalon suivant peut être soumis après un remboursement.
    s.escrow.submit_milestone(&pid, &1, &proof(&s, 3));
}

#[test]
fn dispute_only_inside_window() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    advance(&s, WINDOW);
    assert_eq!(
        s.escrow.try_dispute(&pid, &0, &proof(&s, 2)),
        Err(Ok(Error::ChallengeWindowClosed.into()))
    );
}

#[test]
fn cannot_release_twice() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    advance(&s, WINDOW);
    s.escrow.release(&pid, &0);
    assert_eq!(s.escrow.try_release(&pid, &0), Err(Ok(Error::WrongStatus.into())));
    assert_eq!(
        s.escrow.try_resolve(&pid, &0, &true),
        Err(Ok(Error::WrongStatus.into()))
    );
}

#[test]
fn no_submission_after_the_deadline() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    advance(&s, DEADLINE);
    assert_eq!(
        s.escrow.try_submit_milestone(&pid, &0, &proof(&s, 1)),
        Err(Ok(Error::DeadlinePassed.into()))
    );
}

#[test]
fn investor_reclaims_unsubmitted_milestones_after_the_deadline() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    advance(&s, WINDOW);
    s.escrow.release(&pid, &0);
    s.escrow.submit_milestone(&pid, &1, &proof(&s, 2));

    // Before the deadline there is nothing to reclaim.
    assert_eq!(s.escrow.try_reclaim(&pid), Err(Ok(Error::NothingToReclaim.into())));

    advance(&s, DEADLINE);
    s.escrow.reclaim(&pid);
    // Anyone can trigger it: the money can only go back to the investor.
    assert!(s.env.auths().is_empty());
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Released);
    // A milestone submitted before the deadline can still be released.
    assert_eq!(status(&s, pid, 1), MilestoneStatus::Submitted);
    assert_eq!(status(&s, pid, 2), MilestoneStatus::Refunded);
    assert_eq!(s.token.balance(&s.investor), 1_000_000 - 20_000);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 20_000);

    s.escrow.release(&pid, &1);
    assert_eq!(s.token.balance(&s.lab), 20_000);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(s.escrow.try_reclaim(&pid), Err(Ok(Error::NothingToReclaim.into())));
}

#[test]
fn investor_reclaims_a_dispute_the_arbiter_never_settles() {
    let s = setup(0);
    let pid = disputed(&s);

    advance(&s, WINDOW + ARBITER_PERIOD - 1);
    assert_eq!(s.escrow.try_reclaim(&pid), Err(Ok(Error::NothingToReclaim.into())));

    advance(&s, 1);
    s.escrow.reclaim(&pid);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Refunded);
    // The next milestone is unblocked and the lab can carry on before the deadline.
    s.escrow.submit_milestone(&pid, &1, &proof(&s, 3));
    assert_eq!(status(&s, pid, 1), MilestoneStatus::Submitted);
}

#[test]
fn arbiter_can_still_settle_until_someone_reclaims() {
    let s = setup(0);
    let pid = disputed(&s);
    advance(&s, WINDOW + ARBITER_PERIOD);
    s.escrow.resolve_partial(&pid, &0, &6_000);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Split);
    assert_eq!(s.escrow.try_reclaim(&pid), Err(Ok(Error::NothingToReclaim.into())));
}

#[test]
fn cancel_refunds_pending_milestones() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    advance(&s, WINDOW);
    s.escrow.release(&pid, &0);

    s.escrow.cancel(&pid);
    assert_eq!(status(&s, pid, 1), MilestoneStatus::Refunded);
    assert_eq!(status(&s, pid, 2), MilestoneStatus::Refunded);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
    assert_eq!(s.token.balance(&s.investor), 1_000_000 - 10_000);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 10_000);
}

#[test]
fn refund_does_not_block_when_shares_were_sold() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);
    let buyer = Address::generate(&s.env);
    s.splitter.set_allowed(&buyer, &true);
    s.splitter
        .transfer_shares(&s.license_id, &s.investor, &buyer, &25_000);

    s.escrow.cancel(&pid);
    assert_eq!(s.splitter.shares_of(&s.license_id, &s.investor), 0);
    assert_eq!(s.splitter.shares_of(&s.license_id, &buyer), 25_000);
    assert_eq!(s.token.balance(&s.escrow.address), 0);
}

#[test]
fn project_requires_configured_split_and_valid_amounts() {
    let s = setup(0);
    assert_eq!(
        s.escrow.try_create_project(
            &s.license_id,
            &s.investor,
            &s.arbiter,
            &vec![&s.env, 0i128],
            &WINDOW,
            &DEADLINE
        ),
        Err(Ok(Error::InvalidMilestones.into()))
    );
}

#[test]
fn arbiter_window_and_deadline_are_checked_at_creation() {
    let s = setup(0);
    let try_create = |arbiter: &Address, window: u64, deadline: u64| {
        s.escrow.try_create_project(
            &s.license_id,
            &s.investor,
            arbiter,
            &vec![&s.env, 10i128],
            &window,
            &deadline,
        )
    };
    let parties = Err(Ok(Error::InvalidParties.into()));
    assert_eq!(try_create(&s.investor, WINDOW, DEADLINE), parties);
    assert_eq!(try_create(&s.lab, WINDOW, DEADLINE), parties);

    let window = Err(Ok(Error::InvalidWindow.into()));
    assert_eq!(try_create(&s.arbiter, 0, DEADLINE), window);
    assert_eq!(try_create(&s.arbiter, WINDOW - 1, DEADLINE), window);
    assert_eq!(try_create(&s.arbiter, 31 * 24 * 60 * 60, DEADLINE), window);

    advance(&s, 1_000);
    assert_eq!(
        try_create(&s.arbiter, WINDOW, 1_000),
        Err(Ok(Error::InvalidDeadline.into()))
    );
    assert!(try_create(&s.arbiter, WINDOW, 1_001).is_ok());
}

#[test]
fn unverified_investor_cannot_fund() {
    let s = setup(0);
    let stranger = Address::generate(&s.env);
    s.token_admin.mint(&stranger, &30_000);
    let pid = s.escrow.create_project(
        &s.license_id,
        &stranger,
        &s.arbiter,
        &vec![&s.env, 30_000i128],
        &WINDOW,
        &DEADLINE,
    );
    assert!(s.escrow.try_fund(&pid).is_err());
    assert_eq!(s.token.balance(&stranger), 30_000);
}

// ---------- Who must sign ----------
// `mock_all_auths` accepts any signature, so the tests above do not prove who has
// to sign. Here `env.auths()` lists the addresses whose authorisation the last call
// required, and `sign_as` lets exactly the given addresses sign the next call: the
// wrong party must be refused, the right one accepted.

extern crate std;

use soroban_sdk::testutils::{MockAuth, MockAuthInvoke};
use soroban_sdk::{IntoVal, Val};

/// Addresses that had to authorise the last call.
fn signers(env: &Env) -> std::vec::Vec<Address> {
    env.auths().into_iter().map(|(who, _)| who).collect()
}

/// Only `who` sign the next call to `fn_name` with `args`.
fn sign_as(s: &Setup, who: &[&Address], fn_name: &str, args: soroban_sdk::Vec<Val>) {
    let invoke = MockAuthInvoke {
        contract: &s.escrow.address,
        fn_name,
        args,
        sub_invokes: &[],
    };
    let auths: std::vec::Vec<MockAuth> = who
        .iter()
        .map(|address| MockAuth {
            address,
            invoke: &invoke,
        })
        .collect();
    s.env.mock_auths(&auths);
}

#[test]
fn each_step_is_signed_by_its_party() {
    let s = setup(0);
    let pid = create(&s);
    assert_eq!(signers(&s.env), [s.lab.clone()]);
    s.escrow.fund(&pid);
    assert_eq!(signers(&s.env), [s.investor.clone()]);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));
    assert_eq!(signers(&s.env), [s.lab.clone()]);
    s.escrow.dispute(&pid, &0, &proof(&s, 2));
    assert_eq!(signers(&s.env), [s.investor.clone()]);
    s.escrow.resolve_partial(&pid, &0, &5_000);
    assert_eq!(signers(&s.env), [s.arbiter.clone()]);

    // Release after the window needs no signature at all: anyone can trigger it.
    s.escrow.submit_milestone(&pid, &1, &proof(&s, 3));
    advance(&s, WINDOW);
    s.escrow.release(&pid, &1);
    assert!(signers(&s.env).is_empty());

    s.escrow.cancel(&pid);
    assert_eq!(signers(&s.env), [s.lab.clone(), s.investor.clone()]);
}

#[test]
fn only_the_lab_submits_and_only_the_investor_disputes() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);

    let args: soroban_sdk::Vec<Val> = (pid, 0u32, proof(&s, 1)).into_val(&s.env);
    sign_as(&s, &[&s.investor], "submit_milestone", args.clone());
    assert!(s.escrow.try_submit_milestone(&pid, &0, &proof(&s, 1)).is_err());
    sign_as(&s, &[&s.lab], "submit_milestone", args);
    s.escrow.submit_milestone(&pid, &0, &proof(&s, 1));

    let args: soroban_sdk::Vec<Val> = (pid, 0u32, proof(&s, 2)).into_val(&s.env);
    for wrong in [&s.lab, &s.arbiter] {
        sign_as(&s, &[wrong], "dispute", args.clone());
        assert!(s.escrow.try_dispute(&pid, &0, &proof(&s, 2)).is_err());
    }
    sign_as(&s, &[&s.investor], "dispute", args);
    s.escrow.dispute(&pid, &0, &proof(&s, 2));
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Disputed);
}

#[test]
fn only_the_arbiter_settles_a_dispute() {
    let s = setup(0);
    let pid = disputed(&s);

    let args: soroban_sdk::Vec<Val> = (pid, 0u32, 6_000u32).into_val(&s.env);
    for wrong in [&s.lab, &s.investor] {
        sign_as(&s, &[wrong], "resolve_partial", args.clone());
        assert!(s.escrow.try_resolve_partial(&pid, &0, &6_000).is_err());
    }
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Disputed);

    sign_as(&s, &[&s.arbiter], "resolve_partial", args);
    s.escrow.resolve_partial(&pid, &0, &6_000);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Split);
}

#[test]
fn cancel_needs_both_the_lab_and_the_investor() {
    let s = setup(0);
    let pid = create(&s);
    s.escrow.fund(&pid);

    let args: soroban_sdk::Vec<Val> = (pid,).into_val(&s.env);
    sign_as(&s, &[&s.lab], "cancel", args.clone());
    assert!(s.escrow.try_cancel(&pid).is_err());
    sign_as(&s, &[&s.investor], "cancel", args.clone());
    assert!(s.escrow.try_cancel(&pid).is_err());
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Pending);

    sign_as(&s, &[&s.lab, &s.investor], "cancel", args);
    s.escrow.cancel(&pid);
    assert_eq!(status(&s, pid, 0), MilestoneStatus::Refunded);
}
