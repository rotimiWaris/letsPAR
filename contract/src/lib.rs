use near_sdk::serde_json::{self, json};
use near_sdk::store::IterableMap;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, Promise};

/// Bytes reserved when guessing whether the contract can store one more bag.
/// The real charge is whatever the trie grows by; this estimate only fails early.
const BAG_STORAGE_BYTES: u64 = 800;

/// An open bag of native NEAR. The amount is the deposit attached to `post`.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Bag {
    pub poster: AccountId,
    pub amount: NearToken,
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
    pub total_swapped: String,
    pub swap_count: u64,
    pub post_count: u64,
    pub reclaim_count: u64,
    pub open_count: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    bags: IterableMap<u64, Bag>,
    next_id: u64,
    total_swapped: u128,
    swap_count: u64,
    post_count: u64,
    reclaim_count: u64,
    /// True while a payable method is in progress, so a nested call cannot
    /// spend a bag the outer call has already decided to close.
    busy: bool,
}

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            bags: IterableMap::new(b"b"),
            next_id: 1,
            total_swapped: 0,
            swap_count: 0,
            post_count: 0,
            reclaim_count: 0,
            busy: false,
        }
    }

    /// Lock the attached NEAR as a new open bag.
    #[payable]
    pub fn post(&mut self) -> BagView {
        self.enter();
        let amount = env::attached_deposit();
        require!(amount.as_yoctonear() > 0, "deposit is zero");
        self.ensure_storage(BAG_STORAGE_BYTES);

        let bag_id = self.next_id;
        self.next_id += 1;
        let bag = Bag {
            poster: env::predecessor_account_id(),
            amount,
            created_at_ms: env::block_timestamp_ms(),
        };
        let view = to_view(bag_id, &bag);
        self.bags.insert(bag_id, bag);
        self.post_count += 1;
        emit(
            "post",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": view.poster,
                "amount": view.amount,
            }),
        );
        self.leave();
        view
    }

    /// Attach exactly the bag's amount. The two deposits change hands and the bag closes.
    #[payable]
    pub fn match_bag(&mut self, bag_id: u64) {
        self.enter();
        let attached = env::attached_deposit();
        let matcher = env::predecessor_account_id();
        let bag = self.read_open(bag_id);

        require!(matcher != bag.poster, "matcher is the poster");
        require!(
            attached == bag.amount,
            "attached deposit must equal the bag amount"
        );

        // Close before either transfer so a re-entering call cannot spend the bag.
        self.bags.remove(&bag_id);
        self.swap_count += 1;
        self.total_swapped = self
            .total_swapped
            .checked_add(bag.amount.as_yoctonear())
            .expect("total swapped overflow");
        emit(
            "swap",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": bag.poster,
                "matcher": matcher,
                "amount": bag.amount.as_yoctonear().to_string(),
            }),
        );

        Promise::new(matcher).transfer(bag.amount).detach();
        Promise::new(bag.poster).transfer(attached).detach();
        self.leave();
    }

    /// The poster pulls an unmatched bag back whole.
    pub fn reclaim(&mut self, bag_id: u64) {
        self.enter();
        let caller = env::predecessor_account_id();
        let bag = self.read_open(bag_id);
        require!(caller == bag.poster, "only the poster can reclaim");

        self.bags.remove(&bag_id);
        self.reclaim_count += 1;
        emit(
            "reclaim",
            &json!({
                "bag_id": bag_id.to_string(),
                "poster": bag.poster,
                "amount": bag.amount.as_yoctonear().to_string(),
            }),
        );
        Promise::new(bag.poster).transfer(bag.amount).detach();
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

    pub fn get_stats(&self) -> Stats {
        Stats {
            total_swapped: self.total_swapped.to_string(),
            swap_count: self.swap_count,
            post_count: self.post_count,
            reclaim_count: self.reclaim_count,
            open_count: u64::from(self.bags.len()),
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

    fn read_open(&self, bag_id: u64) -> Bag {
        self.bags.get(&bag_id).cloned().unwrap_or_else(|| {
            env::panic_str("bag is closed");
        })
    }

    fn ensure_storage(&self, extra_bytes: u64) {
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let needed = (u128::from(env::storage_usage()) + u128::from(extra_bytes)) * byte_cost;
        require!(
            env::account_balance().as_yoctonear() >= needed,
            "not enough contract balance to store this bag"
        );
    }
}

fn to_view(bag_id: u64, bag: &Bag) -> BagView {
    BagView {
        bag_id,
        poster: bag.poster.clone(),
        amount: bag.amount.as_yoctonear().to_string(),
        created_at_ms: bag.created_at_ms,
    }
}

fn emit(event: &str, data: &serde_json::Value) {
    let payload = json!({
        "standard": "letspar",
        "version": "1.0.0",
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{get_logs, VMContextBuilder};
    use near_sdk::{testing_env, Gas, NearToken};

    fn set_ctx(predecessor: &str, deposit_yocto: u128) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id("letspar.testnet".parse().unwrap())
            .predecessor_account_id(predecessor.parse().unwrap())
            .signer_account_id(predecessor.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
            .account_balance(NearToken::from_near(50))
            .prepaid_gas(Gas::from_tgas(300));
        testing_env!(builder.build());
    }

    fn contract() -> Contract {
        set_ctx("deployer.testnet", 0);
        Contract::new()
    }

    fn one_near() -> u128 {
        NearToken::from_near(1).as_yoctonear()
    }

    #[test]
    fn post_lists_the_bag() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        assert_eq!(bag.bag_id, 1);
        assert_eq!(bag.poster.as_str(), "alice.testnet");
        assert_eq!(bag.amount, one_near().to_string());
        assert_eq!(c.get_open_bags(0, 10).len(), 1);
        assert!(c.get_bag(1).is_some());
        assert_eq!(c.get_stats().post_count, 1);
        assert_eq!(c.get_stats().open_count, 1);
        let logs = get_logs();
        assert!(logs.iter().any(|line| line.starts_with("EVENT_JSON:") && line.contains("\"event\":\"post\"")));
    }

    #[test]
    fn equal_match_swaps_and_closes() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("bob.testnet", one_near());
        c.match_bag(bag.bag_id);
        assert!(c.get_bag(bag.bag_id).is_none());
        assert!(c.get_open_bags(0, 10).is_empty());
        let stats = c.get_stats();
        assert_eq!(stats.swap_count, 1);
        assert_eq!(stats.total_swapped, one_near().to_string());
        assert_eq!(stats.open_count, 0);
        let logs = get_logs();
        assert!(logs.iter().any(|line| line.contains("\"event\":\"swap\"") && line.contains("bob.testnet")));
    }

    #[test]
    #[should_panic(expected = "attached deposit must equal the bag amount")]
    fn unequal_match_is_rejected() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("bob.testnet", one_near() / 2);
        c.match_bag(bag.bag_id);
    }

    #[test]
    fn unequal_match_leaves_the_bag_open() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("bob.testnet", one_near() / 2);
        let failed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.match_bag(bag.bag_id);
        }));
        assert!(failed.is_err());
        assert!(c.get_bag(bag.bag_id).is_some());
        assert_eq!(c.get_stats().swap_count, 0);
        assert_eq!(c.get_stats().open_count, 1);
    }

    #[test]
    #[should_panic(expected = "matcher is the poster")]
    fn poster_cannot_match_own_bag() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("alice.testnet", one_near());
        c.match_bag(bag.bag_id);
    }

    #[test]
    #[should_panic(expected = "bag is closed")]
    fn closed_bag_cannot_be_matched() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("bob.testnet", one_near());
        c.match_bag(bag.bag_id);
        set_ctx("carol.testnet", one_near());
        c.match_bag(bag.bag_id);
    }

    #[test]
    fn reclaim_returns_the_bag_to_the_poster() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near() / 5);
        let bag = c.post();
        set_ctx("alice.testnet", 0);
        c.reclaim(bag.bag_id);
        assert!(c.get_bag(bag.bag_id).is_none());
        assert_eq!(c.get_stats().reclaim_count, 1);
        assert_eq!(c.get_stats().open_count, 0);
        let logs = get_logs();
        assert!(logs.iter().any(|line| line.contains("\"event\":\"reclaim\"")));
    }

    #[test]
    #[should_panic(expected = "only the poster can reclaim")]
    fn stranger_cannot_reclaim() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("bob.testnet", 0);
        c.reclaim(bag.bag_id);
    }

    #[test]
    #[should_panic(expected = "bag is closed")]
    fn reclaim_of_closed_bag_is_rejected() {
        let mut c = contract();
        set_ctx("alice.testnet", one_near());
        let bag = c.post();
        set_ctx("alice.testnet", 0);
        c.reclaim(bag.bag_id);
        c.reclaim(bag.bag_id);
    }

    #[test]
    #[should_panic(expected = "deposit is zero")]
    fn empty_post_is_rejected() {
        let mut c = contract();
        set_ctx("alice.testnet", 0);
        c.post();
    }

    #[test]
    fn open_bags_are_paged() {
        let mut c = contract();
        for name in ["alice.testnet", "bob.testnet", "carol.testnet"] {
            set_ctx(name, one_near());
            c.post();
        }
        let page = c.get_open_bags(1, 1);
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].bag_id, 2);
        assert!(c.get_open_bags(10, 5).is_empty());
        assert!(c.get_bag(99).is_none());
    }
}
