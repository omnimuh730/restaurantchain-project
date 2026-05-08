# Schema · Credit cards (redirect)

Wallet and card **balances** are modeled in a single **`cards`** collection with `type: "wallet" | "card"`.

See **[`cards.md`](./cards.md)** (account shapes) and **[`wallets.md`](./wallets.md)** (`wallet_transactions` — all wallet/card movements).

There is **no** separate `card_transactions` collection; card activity is recorded in **`wallet_transactions`**.
