---
paths:
  - "app/free-agency/**"
  - "app/poaching/**"
  - "app/bids/**"
  - "components/OfferForm.js"
  - "components/PoachAlert.js"
  - "lib/freeAgentPool.js"
  - "lib/contractAssistant.js"
---

# Free agency and poaching

Sealed windows, the one offer form, and poaching as free agency on a practice squad player.

### Permissions and visibility

- **Sealed things stay sealed, including from officers.** Open-window offers show a
  contested flag and never a count — in a ten-team league a count leaks who is in. **Do
  not add a count, and do not add a commissioner-only peek.**
- **Losing bidders are named in both acquisition systems once the result is settled**
  (commissioner rulings). A verified auction tier's results name every bidding team, winning
  or losing (`auction_tier_results`), and a losing, withdrawn or passed-over *free agency*
  offer **names the team** once its window resolves. **Do not anonymise either.** Until then
  both stay sealed: a tier's bids until the tier is verified, and offer rows until the window
  resolves — every join carries that predicate, and dropping it would make the league log
  differ by viewer.
- **Poaching is free agency on a practice squad player, not a separate system.** A poach
  bid is an ordinary `submit_fa_offer` call; the database routes it and opens a window
  with `window_kind = 'poach'`. **Poach-ness is read from the window's kind, never from
  the offer** — `offer_kind` is `'active'` on every poach bid. Do not add a poach flag to
  the offer or a second RPC.
- **There is no Withdraw, on purpose.** Rule 5.14(d): an offer can only be replaced by a
  higher one. `withdraw_fa_offer` still exists and **refuses every call by design** — do
  not "fix" it and do not re-add the button. Historical `withdrawn` rows and the
  `fa_offer_withdrawn` feed kind remain and stay mapped.
- **Who opened a window is sealed until it resolves.** The board view returns
  `opened_by` null while a window is open or closed-unresolved, and the table column is
  sealed by grant. The page prints "Sealed". Do not look the opener up another way.
- **The preview gate lives in the database.** `preview_fa_window` refuses a non-officer
  and refuses before `closes_at`, because its ranking *is* the sealed offers. The page's
  officer check is presentation. Preview and resolve run the same award code, so they
  cannot disagree — do not reimplement the ranking in the client.
- **The poach checks on the offer form are advisory.** `edfl_poach_offer_valid` is the
  rule; the form mirrors it so an owner sees the problem before submitting. When the two
  disagree, the database is right and the form is the defect.
- **The practice squads list comes from `poachable_players`, authenticated only.** Its
  `poaching_open` flag is the calendar test; the section's visibility is never a clock in
  JavaScript.
- **Resolve notices key off `outcome`, not `result`.** `outcome` is one of `awarded`,
  `voided`, `poached`, `retained_by_bid`, `retained_on_rookie_contract`; `result` only
  says awarded or void and cannot tell a poach from a retention.

### Pages and components

- **Do not simplify the offer-status reducer.** It once read "withdrawn" for an offer that
  was still standing, because a later re-submission was not accounted for.

### Poach alerts

- **The emails, DMs and Dianna's #insider-threat post are composed and sent by the database**
  (`poach_notice_text`, `dianna_poach_line`, the `edfl_poach_notify` cron). They reuse the
  compliance outbox, so `/notifications`' recent list shows them; its `KIND_LABEL` map carries
  the three `poach_*` kinds. **Nothing in this repo sends a poach notice.**

### The practice squad designations and the roster bar

- **The one owner-visible sentence on `/poaching` that assumed a Tuesday opening is gone.**
  The lead card now says *"what the opening exposes"*; the opening instant is the calendar
  row's, read through `league_calendar` (`opensAt`), and it moved once already (to Wednesday
  noon). **Never write a weekday into poaching copy.**
- **`actionFor()` on the poaching board applies the exclusions in the database's order** —
  waivers, pending cut, exempt, grace, market closed, own player. A live window outranks the
  exemption and the grace (an exemption cannot close a window), which is why both tests carry
  `!r.live_window_id`. Keep the order in step with `edfl_poach_eligible()`.

### The wires, Insider Threat, the injury cross, Phase 2G

- **There is exactly one offer form and exactly one `submit_fa_offer` caller in the repo.**
  `components/OfferForm.js` is mounted by both `/free-agency` and `/poaching`; a poach bid is
  an ordinary free agency offer that the database routes. **Do not add a second form, a
  second payload builder or a second caller** — two forms against one RPC is how the two
  screens start disagreeing about what a legal offer is.
