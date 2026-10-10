---
paths:
  - "app/settings/**"
  - "app/notifications/**"
  - "app/admin/owner-activity/**"
  - "components/AutoIrForm.js"
  - "components/NotificationPrefsForm.js"
  - "components/ComplianceAlert.js"
  - "components/OwnerInfoDialog.js"
  - "components/OwnerInfoPanel.js"
  - "components/ownerInfoActions.js"
---

# Settings, notices and owner information

The owner's settings page, compliance notices, automatic IR, and owner cards.

- **The last-active band is a band, never a time**, for everyone but yourself and the
  officers.
- **The login email has no visibility toggle and must not be given one.** It is the
  credential half of the login, not a way to reach somebody.
- **Owner-card editing defaults to self-edit only.** A future mount that forgets the prop
  gets self-edit, never officer editing by accident. **Do not change the default and do
  not pass the all-scope value anywhere else.**

- **`/settings` is the owner's one settings page**: Roster automation (`components/AutoIrForm.js`
  → `save_my_roster_prefs`), Notifications (`components/NotificationPrefsForm.js`, unchanged
  apart from labels) and Contact info (`OwnerInfoPanel` given **only the `is_self` row** of
  `owner_directory()`, at its default self-edit scope). **`/notifications` is now a redirect to
  `/settings#notifications`** because every email and DM written before this date links there —
  do not delete the route. `app/notifications/actions.js` stays where it is; the form imports it.
- **`components/ComplianceAlert.js` reads a NEW shape from `my_compliance_alert()`**:
  `roster_fine` (the weekly $75/$25 fine, `upcoming` or `curable`), `items[]` each with its own
  `deadline_label`/`fine_text` and a `players[]` list (over-limit players with `kickoff_label`
  and `ineligible`, or IR players with `due_label`), plus `grace_label` and
  `next_checkpoint_label` for the Sunday and Monday night $25 checkpoints, `ineligible[]` and
  `assessed[]` (a checkpoint charge still inside its 24 hours says so in its label). **Every
  figure and deadline is composed in the database** (`team_compliance_alert`); the component
  prints text. Do not compute a deadline, a fine or "who is over the limit" in JavaScript —
  the engine (`compliance_v2_due`) charges from the same functions the alert reads.
- **Automatic IR moves are made by the database** (`edfl_auto_ir_due`, a two-minute job) and
  **never between a player's kickoff and the end of that week** (`edfl_auto_move_safe()`). The
  form says so; nothing in this repo moves a player automatically. The guard predates scoring at
  kickoff, which now fixes a player's spot for a week by itself (`edfl_roster_at()`); whether the
  guard is still needed is a database question for the project chat.
