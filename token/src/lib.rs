use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap};
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseResult};

const ONE: u128 = 1_000_000_000_000_000_000_000_000;
const TOTAL_SUPPLY: u128 = 1_000_000_000 * ONE;
const FAUCET_AMOUNT: u128 = 100 * ONE;
const CLAIM_WAIT_MS: u64 = 3 * 60 * 60 * 1000;
const MIN_BAG: u128 = ONE;
const STORAGE_COST: u128 = 2_000_000_000_000_000_000_000;
const BURN_BPS: u128 = 100;

#[ext_contract(ext_self)]
pub trait SelfCallbacks {
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128;
}

#[near(serializers = [json])]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bag {
    pub poster: AccountId,
    pub amount: u128,
    pub created_at_ms: u64,
}

#[near(serializers = [json])]
pub struct BagView {
    pub bag_id: u64,
    pub poster: AccountId,
    pub amount: String,
    pub created_at_ms: u64,
}

#[near(serializers = [json])]
pub struct Stats {
    pub total_supply: String,
    pub total_burned: String,
    pub total_rewarded: String,
    pub total_swapped: String,
    pub swap_count: u64,
    pub post_count: u64,
    pub reclaim_count: u64,
    pub open_count: u64,
    pub faucet_amount: String,
}

#[near(serializers = [json])]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    accounts: LookupMap<AccountId, u128>,
    claimed: LookupMap<AccountId, u64>,
    bags: IterableMap<u64, Bag>,
    next_id: u64,
    total_supply: u128,
    total_burned: u128,
    total_rewarded: u128,
    escrowed: u128,
    total_swapped: u128,
    swap_count: u64,
    post_count: u64,
    reclaim_count: u64,
    busy: bool,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        let mut contract = Self {
            accounts: LookupMap::new(b"a"),
            claimed: LookupMap::new(b"c"),
            bags: IterableMap::new(b"g"),
            next_id: 1,
            total_supply: TOTAL_SUPPLY,
            total_burned: 0,
            total_rewarded: 0,
            escrowed: 0,
            total_swapped: 0,
            swap_count: 0,
            post_count: 0,
            reclaim_count: 0,
            busy: false,
        };
        contract.accounts.insert(env::current_account_id(), TOTAL_SUPPLY);
        contract
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: "ft-1.0.0".to_string(),
            name: "LetsPAR".to_string(),
            symbol: "PAR".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 24,
        }
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.accounts.get(&account_id).copied().unwrap_or(0))
    }

    pub fn storage_balance_bounds(&self) -> StorageBalance {
        let cost = U128(STORAGE_COST);
        StorageBalance { total: cost, available: U128(0) }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.accounts.contains_key(&account_id) {
            Some(StorageBalance {
                total: U128(STORAGE_COST),
                available: U128(0),
            })
        } else {
            None
        }
    }

    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) {
        let beneficiary = account_id.unwrap_or_else(env::predecessor_account_id);
        let attached = env::attached_deposit().as_yoctonear();
        let payer = env::predecessor_account_id();
        if self.accounts.contains_key(&beneficiary) {
            if attached > 0 {
                Promise::new(payer).transfer(NearToken::from_yoctonear(attached)).detach();
            }
            return;
        }
        require!(attached >= STORAGE_COST, "need 0.002 NEAR for storage");
        self.accounts.insert(beneficiary, 0);
        let refund = attached - STORAGE_COST;
        if refund > 0 {
            Promise::new(payer).transfer(NearToken::from_yoctonear(refund)).detach();
        }
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        require!(env::attached_deposit().as_yoctonear() == 1, "need 1 yocto");
        let sender = env::predecessor_account_id();
        self.transfer(&sender, &receiver_id, amount.0);
        emit_ft("ft_transfer", &sender, &receiver_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        require!(env::attached_deposit().as_yoctonear() == 1, "need 1 yocto");
        let sender = env::predecessor_account_id();
        self.transfer(&sender, &receiver_id, amount.0);
        emit_ft("ft_transfer", &sender, &receiver_id, amount.0, memo.as_deref());
        Promise::new(receiver_id.clone())
            .function_call(
                "ft_on_transfer".to_string(),
                serde_json::to_vec(&json!({
                    "sender_id": sender,
                    "amount": amount,
                    "msg": msg,
                }))
                .unwrap(),
                NearToken::from_yoctonear(0),
                Gas::from_tgas(60),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(20))
                    .ft_resolve_transfer(sender, receiver_id, amount),
            )
    }

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "only the PAR contract"
        );
        self.enter();
        let action = msg.trim();
        let refund = if action == "post" {
            self.open_bag(sender_id, amount.0);
            0
        } else if let Some(raw) = action.strip_prefix("match:") {
            let bag_id: u64 = raw.parse().unwrap_or_else(|_| env::panic_str("bad bag id"));
            self.take_match(sender_id, amount.0, bag_id);
            0
        } else {
            env::panic_str("unknown action");
        };
        self.leave();
        U128(refund)
    }

    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let refund = match env::promise_result(0) {
            PromiseResult::Successful(bytes) => {
                serde_json::from_slice::<U128>(&bytes).map(|value| value.0).unwrap_or(amount.0)
            }
            _ => amount.0,
        };
        let refund = refund.min(amount.0);
        if refund > 0 {
            self.transfer(&receiver_id, &sender_id, refund);
            emit_ft("ft_transfer", &receiver_id, &sender_id, refund, Some("refund"));
        }
        U128(amount.0 - refund)
    }

    pub fn claim(&mut self) {
        let account = env::predecessor_account_id();
        require!(self.accounts.contains_key(&account), "register storage first");
        let now = env::block_timestamp_ms();
        if let Some(last) = self.claimed.get(&account).copied() {
            let ready = last.saturating_add(CLAIM_WAIT_MS);
            require!(now >= ready, "next claim is not ready");
        }
        let treasury = env::current_account_id();
        let liquid = self.balance_of(&treasury).saturating_sub(self.escrowed);
        require!(liquid >= FAUCET_AMOUNT, "faucet is empty");
        self.claimed.insert(account.clone(), now);
        self.transfer(&treasury, &account, FAUCET_AMOUNT);
        emit_ft("ft_transfer", &treasury, &account, FAUCET_AMOUNT, Some("faucet"));
    }

    pub fn reclaim(&mut self, bag_id: u64) {
        self.enter();
        let caller = env::predecessor_account_id();
        let bag = self.read_open(bag_id);
        require!(caller == bag.poster, "only the poster can reclaim");
        self.bags.remove(&bag_id);
        self.escrowed -= bag.amount;
        self.reclaim_count += 1;
        let treasury = env::current_account_id();
        self.transfer(&treasury, &caller, bag.amount);
        emit_ft("ft_transfer", &treasury, &caller, bag.amount, Some("reclaim"));
        emit_event(
            "reclaim",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": caller,
                "amount": bag.amount.to_string(),
            }),
        );
        self.leave();
    }

    pub fn get_open_bags(&self, from_index: u32, limit: u32) -> Vec<BagView> {
        let limit = limit.min(50) as usize;
        self.bags
            .iter()
            .skip(from_index as usize)
            .take(limit)
            .map(|(id, bag)| to_view(*id, bag))
            .collect()
    }

    pub fn get_bag(&self, bag_id: u64) -> Option<BagView> {
        self.bags.get(&bag_id).map(|bag| to_view(bag_id, bag))
    }

    pub fn next_claim_ms(&self, account_id: AccountId) -> u64 {
        match self.claimed.get(&account_id).copied() {
            Some(last) => last.saturating_add(CLAIM_WAIT_MS),
            None => 0,
        }
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            total_supply: self.total_supply.to_string(),
            total_burned: self.total_burned.to_string(),
            total_rewarded: self.total_rewarded.to_string(),
            total_swapped: self.total_swapped.to_string(),
            swap_count: self.swap_count,
            post_count: self.post_count,
            reclaim_count: self.reclaim_count,
            open_count: u64::from(self.bags.len()),
            faucet_amount: FAUCET_AMOUNT.to_string(),
        }
    }
}

impl Contract {
    fn enter(&mut self) {
        require!(!self.busy, "reentrant call");
        self.busy = true;
    }

    fn leave(&mut self) {
        self.busy = false;
    }

    fn balance_of(&self, account: &AccountId) -> u128 {
        self.accounts.get(account).copied().unwrap_or(0)
    }

    fn transfer(&mut self, from: &AccountId, to: &AccountId, amount: u128) {
        require!(amount > 0, "amount is zero");
        require!(self.accounts.contains_key(to), "receiver is not registered");
        let from_balance = self.balance_of(from);
        require!(from_balance >= amount, "not enough PAR");
        self.accounts.insert(from.clone(), from_balance - amount);
        let to_balance = self.balance_of(to);
        self.accounts.insert(to.clone(), to_balance + amount);
    }

    fn open_bag(&mut self, poster: AccountId, amount: u128) {
        require!(amount >= MIN_BAG, "post at least 1 PAR");
        let bag_id = self.next_id;
        self.next_id += 1;
        let bag = Bag {
            poster: poster.clone(),
            amount,
            created_at_ms: env::block_timestamp_ms(),
        };
        self.bags.insert(bag_id, bag);
        self.escrowed += amount;
        self.post_count += 1;
        emit_event(
            "post",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": poster,
                "amount": amount.to_string(),
            }),
        );
    }

    fn take_match(&mut self, matcher: AccountId, amount: u128, bag_id: u64) {
        let bag = self.read_open(bag_id);
        require!(matcher != bag.poster, "matcher is the poster");
        require!(amount == bag.amount, "attached deposit must equal the bag amount");
        let cut = amount / BURN_BPS;
        require!(cut > 0, "amount is too small to burn");
        let payout = amount - cut;
        let burned = cut;
        let reward = cut;
        self.bags.remove(&bag_id);
        self.escrowed -= amount;
        let treasury = env::current_account_id();
        self.transfer(&treasury, &bag.poster, payout);
        self.transfer(&treasury, &matcher, payout + reward);
        self.burn_from_treasury(burned);
        self.total_rewarded += reward;
        self.swap_count += 1;
        self.total_swapped += amount;
        emit_ft("ft_transfer", &treasury, &bag.poster, payout, Some("swap"));
        emit_ft("ft_transfer", &treasury, &matcher, payout + reward, Some("reward"));
        emit_event(
            "swap",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": bag.poster,
                "matcher": matcher,
                "amount": amount.to_string(),
                "burned": burned.to_string(),
                "rewarded": reward.to_string(),
            }),
        );
    }

    fn burn_from_treasury(&mut self, amount: u128) {
        let treasury = env::current_account_id();
        let balance = self.balance_of(&treasury);
        require!(balance >= amount, "not enough PAR to burn");
        self.accounts.insert(treasury.clone(), balance - amount);
        self.total_supply -= amount;
        self.total_burned += amount;
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "nep141",
                "version": "1.0.0",
                "event": "ft_burn",
                "data": [{ "owner_id": treasury, "amount": amount.to_string() }],
            })
        ));
    }

    fn read_open(&self, bag_id: u64) -> Bag {
        self.bags.get(&bag_id).cloned().unwrap_or_else(|| env::panic_str("bag is closed"))
    }
}

fn to_view(bag_id: u64, bag: &Bag) -> BagView {
    BagView {
        bag_id,
        poster: bag.poster.clone(),
        amount: bag.amount.to_string(),
        created_at_ms: bag.created_at_ms,
    }
}

fn emit_ft(event: &str, sender: &AccountId, receiver: &AccountId, amount: u128, memo: Option<&str>) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "nep141",
            "version": "1.0.0",
            "event": event,
            "data": [{
                "old_owner_id": sender,
                "new_owner_id": receiver,
                "amount": amount.to_string(),
                "memo": memo,
            }],
        })
    ));
}

fn emit_event(event: &str, data: &serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({
            "standard": "letspar",
            "version": "1.0.0",
            "event": event,
            "data": [data],
        })
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn set_ctx(predecessor: &str, deposit: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("par.letspar.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .account_balance(NearToken::from_near(50))
            .prepaid_gas(Gas::from_tgas(300));
        testing_env!(builder.build());
    }

    fn ready() -> Contract {
        set_ctx("par.letspar.testnet", 0);
        let mut contract = Contract::new();
        set_ctx("alice.testnet", STORAGE_COST);
        contract.storage_deposit(Some("alice.testnet".parse().unwrap()));
        set_ctx("bob.testnet", STORAGE_COST);
        contract.storage_deposit(Some("bob.testnet".parse().unwrap()));
        set_ctx("par.letspar.testnet", 0);
        contract.claim_to("alice.testnet");
        contract.claim_to("bob.testnet");
        contract
    }

    impl Contract {
        fn claim_to(&mut self, name: &str) {
            set_ctx(name, 0);
            self.claim();
        }

        fn give(&mut self, from: &str, amount: u128) {
            let treasury = env::current_account_id();
            self.transfer(&treasury, &from.parse().unwrap(), amount);
        }
    }

    #[test]
    fn post_match_burns_one_percent_each_side() {
        let mut contract = ready();
        let amount = 10 * ONE;
        set_ctx("par.letspar.testnet", 0);
        set_ctx("par.letspar.testnet", 0);
        contract.give("alice.testnet", amount);
        contract.transfer(&"alice.testnet".parse().unwrap(), &env::current_account_id(), amount);
        contract.ft_on_transfer("alice.testnet".parse().unwrap(), U128(amount), "post".to_string());
        assert_eq!(contract.get_open_bags(0, 10).len(), 1);

        contract.give("bob.testnet", amount);
        contract.transfer(&"bob.testnet".parse().unwrap(), &env::current_account_id(), amount);
        contract.ft_on_transfer(
            "bob.testnet".parse().unwrap(),
            U128(amount),
            "match:1".to_string(),
        );

        let cut = amount / 100;
        let payout = amount - cut;
        assert!(contract.get_bag(1).is_none());
        assert_eq!(contract.ft_balance_of("alice.testnet".parse().unwrap()).0, FAUCET_AMOUNT + payout);
        assert_eq!(contract.ft_balance_of("bob.testnet".parse().unwrap()).0, FAUCET_AMOUNT + amount);
        assert_eq!(contract.get_stats().total_burned, cut.to_string());
        assert_eq!(contract.get_stats().total_rewarded, cut.to_string());
        assert_eq!(contract.get_stats().total_supply, (TOTAL_SUPPLY - cut).to_string());
        assert_eq!(contract.get_stats().swap_count, 1);
    }

    #[test]
    #[should_panic(expected = "attached deposit must equal the bag amount")]
    fn unequal_match_is_rejected() {
        let mut contract = ready();
        let amount = 10 * ONE;
        set_ctx("par.letspar.testnet", 0);
        set_ctx("par.letspar.testnet", 0);
        contract.give("alice.testnet", amount);
        contract.transfer(&"alice.testnet".parse().unwrap(), &env::current_account_id(), amount);
        contract.ft_on_transfer("alice.testnet".parse().unwrap(), U128(amount), "post".to_string());
        contract.ft_on_transfer("bob.testnet".parse().unwrap(), U128(9 * ONE), "match:1".to_string());
    }

    #[test]
    #[should_panic(expected = "matcher is the poster")]
    fn self_match_is_rejected() {
        let mut contract = ready();
        let amount = 10 * ONE;
        set_ctx("par.letspar.testnet", 0);
        set_ctx("par.letspar.testnet", 0);
        contract.give("alice.testnet", amount);
        contract.transfer(&"alice.testnet".parse().unwrap(), &env::current_account_id(), amount);
        contract.ft_on_transfer("alice.testnet".parse().unwrap(), U128(amount), "post".to_string());
        contract.ft_on_transfer("alice.testnet".parse().unwrap(), U128(amount), "match:1".to_string());
    }

    #[test]
    fn reclaim_returns_the_full_bag() {
        let mut contract = ready();
        let amount = 5 * ONE;
        set_ctx("par.letspar.testnet", 0);
        contract.give("alice.testnet", amount);
        contract.transfer(&"alice.testnet".parse().unwrap(), &env::current_account_id(), amount);
        contract.ft_on_transfer("alice.testnet".parse().unwrap(), U128(amount), "post".to_string());
        let before = contract.ft_balance_of("alice.testnet".parse().unwrap()).0;
        set_ctx("alice.testnet", 0);
        contract.reclaim(1);
        assert!(contract.get_bag(1).is_none());
        assert_eq!(contract.ft_balance_of("alice.testnet".parse().unwrap()).0, before + amount);
        assert_eq!(contract.get_stats().total_burned, "0");
    }

    #[test]
    #[should_panic(expected = "next claim is not ready")]
    fn faucet_rejects_a_second_claim_immediately() {
        let mut contract = ready();
        set_ctx("alice.testnet", 0);
        contract.claim();
    }

    #[test]
    fn faucet_allows_another_claim_after_three_hours() {
        let mut contract = ready();
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("par.letspar.testnet".parse().unwrap())
            .predecessor_account_id("alice.testnet".parse().unwrap())
            .signer_account_id("alice.testnet".parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(0))
            .account_balance(NearToken::from_near(50))
            .prepaid_gas(Gas::from_tgas(300))
            .block_timestamp((CLAIM_WAIT_MS as u64) * 1_000_000);
        testing_env!(builder.build());
        let before = contract.ft_balance_of("alice.testnet".parse().unwrap()).0;
        contract.claim();
        assert_eq!(
            contract.ft_balance_of("alice.testnet".parse().unwrap()).0,
            before + FAUCET_AMOUNT
        );
    }
}
