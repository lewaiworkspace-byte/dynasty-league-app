---
paths:
  - "app/bids/**"
  - "app/admin/tier-results/**"
  - "app/admin/new-tier/**"
  - "lib/bidMath.js"
  - "lib/bidPayload.js"
  - "lib/tierRows.js"
  - "lib/delegationNotes.js"
---

# The Blind Bid Auction

Dormant, not deleted. Bid lists, statuses and tier results.

### Pages and components

- **Control precedence in the bid list is ordered and first-match-wins**, and the live-bid
  branch sitting before the delegation branch is load-bearing: a delegation can sit at
  draft while the bid it produced is still live. Offering Cancel there suggests removing
  the entry removes the bid, and it does not.
- **One intended mismatch in the status row builder is documented in the source.** Do not
  "fix" it.
- **A read through the MCP cannot tell you what an owner is entitled to see.** That
  connection is privileged, so a `security_invoker` view returns rows no owner would get.
  Check the flag that governs visibility — `auction_tiers.verified_at`, not the rows that
  came back. And while a competitive window is open, a sealed table is not read through it at
  all: the waiver wire's render fixture was built with invented claim rows for that reason,
  and its header says so.
