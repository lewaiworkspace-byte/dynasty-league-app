# EL DYNASTY FUTBOL LEAGUE-O

## EDFL OWNER HOW-TO MANUAL

**Version 1.2 — October 5, 2026**

*How to do things in the league app.*

---

### What this manual is

This manual answers one kind of question: **how do I do that?**

It does not state the rules and it does not describe how the app is built. Those
are the other two documents:

| If you want to know | Read |
|---|---|
| **What the rule is** — what is allowed, what a thing costs, when a deadline falls | **EDFL Rule Book** |
| **How the app enforces a rule**, and why it was built that way | **EDFL Technical Manual** |
| **Where to click, and what happens when you do** | **This manual** |

Where this manual and the Rule Book differ, **the Rule Book is right and this
manual is the defect**. Every section here cites the rule it serves, so you can
always go and check.

### How sections are addressed

Every section has a stable identifier of the form **HT 5.4**. Those identifiers
do not change when the manual is revised; a section that is withdrawn keeps its
number and is marked withdrawn.

That is deliberate. The league's Discord assistant answers owner questions by
retrieving a section and quoting it, and it needs an address that will still
resolve next season. Each section begins with a one-line **"Answers:"** summary
for the same reason — it is what the retrieval matches on.

If you are reading this in Discord because a bot handed it to you, the section
number in the heading is what to quote back if it gave you the wrong one.

### Screenshots

Screenshots were captured from the live app on **September 20, 2026**, at desktop
width in the dark theme. They live in `EDFL\League Images\How-To`. Figures are
numbered **Fig. 1** through **Fig. 26** and the full index is at the end.
The sections added on October 5, 2026 have no figure yet, and a few earlier
figures pre-date the screen they show; the index says which.

The app looks the same in the light theme; the toggle is in the app bar
(HT 1.6). On a phone the same pages stack into one column — nothing is missing,
it is just narrower.

### Times and money

Every time in the app is **U.S. Eastern**. Every dollar figure is EDFL money,
not real money, except on the League Finances page, where fines are also EDFL
money. Real money is dues and prizes, and those are the treasurer's business,
not the app's.

---

## Contents

**Part 1 — Getting in and getting around**
1.1 Signing in · 1.2 The app bar · 1.3 The menu · 1.4 Putting EDFL on your phone ·
1.5 Finding a player · 1.6 Light and dark

**Part 2 — Your team**
2.1 Team HQ and the four tiles · 2.2 The compliance banner · 2.3 The Overview
tab · 2.4 The Roster tab · 2.5 The Money tab · 2.6 The Media tab · 2.7 Your owner
card · 2.8 Your cash account · 2.9 Designated cuts · 2.10 Owner Settings and
notices

**Part 3 — The weekly cycle**
3.1 The four instants · 3.2 What you must do each week · 3.3 Reading Coming Up ·
3.4 Fixing a compliance failure

**Part 4 — Players and contracts**
4.1 The player card · 4.2 Reading a contract · 4.3 Restructuring a contract ·
4.4 The Fifth Year Option · 4.5 The Player Value Chart

**Part 5 — Roster moves**
5.1 Moving a player between groups · 5.2 Injured reserve · 5.3 The practice squad
*(decision tree)* · 5.4 Cutting a player *(decision tree)*

**Part 6 — Getting players**
6.1 In-season free agency *(decision tree)* · 6.2 The waiver wire *(decision
tree)* · 6.3 Poaching *(decision tree)* · 6.4 The rookie draft · 6.5 The auction

**Part 7 — Trades and the market**
7.1 Proposing a trade · 7.2 Accepting or declining · 7.3 Overlapping offers ·
7.4 The trade block · 7.5 The watchlist · 7.6 Telling Dianna

**Part 8 — Watching the league**
8.1 League · 8.2 Scoreboard · 8.3 Standings · 8.4 The Matchup page · 8.5 Cap
Sheet · 8.6 Transactions · 8.7 Draft Picks · 8.8 Injury Report · 8.9 League
Finances · 8.10 Draft Prospects · 8.11 The Action Log · 8.12 The League Calendar ·
8.13 The three Discord wires · 8.14 The League Library · 8.15 The Data Center and
Claude · 8.16 Statistics

**Part 9 — When something goes wrong**
9.1 A move was refused · 9.2 The app and Sleeper disagree · 9.3 A score looks
wrong · 9.4 Asking for a ruling

**Part 10 — Officers only**
10.1 The Commissioner Portal · 10.2 Resolving a window · 10.3 The syncs ·
10.4 Acting for another team · 10.5 Cash adjustments · 10.6 The Calendar Loader ·
10.7 The League Office memo desk · 10.8 The prospect board

**Appendix — Figure index**

---

# PART 1 — GETTING IN AND GETTING AROUND

## HT 1.1 Signing in

> **Answers:** How do I log in? I can't get into the app. What is the code it
> asked for?

There is no password. You sign in with a code emailed to you.

1. Go to **dynasty-league-app-gold.vercel.app**.
2. Type the email address the commissioner has for you and press **EMAIL ME A
   CODE**.
3. Check that inbox for a **six-digit code** and type it in.

You stay signed in afterwards. You will not be asked again on that device for a
long time.

**If it does not work:**

- The address has to be the one on your owner record, not any address you own.
  Ask the commissioner which one it is.
- The code expires. If it has been sitting in your inbox a while, ask for a new
  one.
- Signing in on your phone does not sign you out anywhere else.

**If you sign in and the app says your login is not linked to a team**, that is
a real state and not a bug: the login worked, but it is not attached to an owner
record. Tell the commissioner; it is a one-line fix on his side.

*Rule: none — this is app access, not a rule of play.*

## HT 1.2 The app bar

> **Answers:** What is that bar at the top? Where does it say who I am? How do I
> sign out?

The bar runs across the top of every page.

Left to right: the **menu** button (HT 1.3); the **EDFL** mark, which is a link
home; the **light/dark toggle** (HT 1.6); and the **player search** box (HT 1.5).

On the right: **who you are logged in as**, with your team name as a link to your
own Team HQ, your team's three-letter code, and **SIGN OUT**.

If you are the commissioner or co-commissioner there is also a **COMMISH** pill
with a count on it. That pill is the only door to the Commissioner Portal (HT
10.1). If you are not an officer you will never see it, and there is nothing
behind it for you.

## HT 1.3 The menu

> **Answers:** Where is everything? How do I get to the calendar / cap sheet /
> waivers? I can't find a page.

**Fig. 5.** Press the button at the far left of the app bar. A panel slides in
from the left with every page in the app, grouped:

| Group | Pages |
|---|---|
| **My team** | Team HQ · Cash account · Restructure a contract · Fifth Year Option · Propose a trade · Owner Settings · Put EDFL on your phone |
| **League** | League · Cap Sheet · Standings · Scoreboard · Calendar · League Finances · Draft Picks · Injury Report · Transactions · Action Log · Rule Book & Manuals · Data Center |
| **Players** | Player Search · Player Value Chart · Statistics · Free Agency · Poaching · Waiver Wire · Draft Prospects |
| **Trades** | All trades · Propose a trade |

**The menu is the app's whole index.** If a page is not in it, there is no other
door to it. Close it with the **×** or by clicking away.

*Fig. 5 was taken before the menu was regrouped. The table above is current.*

![The navigation menu](../League%20Images/How-To/EDFL_HowTo_05_Navigation_Drawer.jpg)

## HT 1.4 Putting EDFL on your phone

> **Answers:** Is there an app? How do I get EDFL on my home screen? Is there
> anything in the App Store?

**Fig. 25.** There is no app store download and there is nothing to install in
the usual sense. The website can put its own icon on your home screen and then
open full-screen with no address bar. It takes about ten seconds.

Menu → **Put EDFL on your phone**, or go to `/install` — that page is readable
signed out, so you can send the link to anyone.

**iPhone and iPad.** It has to be **Safari**; Chrome and Firefox on iOS cannot do
this because Apple only allows it from Safari.

1. Open the app in Safari and sign in as usual.
2. Tap the **Share** button — the square with an arrow coming out of the top, in
   the bar at the bottom.
3. Scroll down and tap **Add to Home Screen**, then **Add**.

**Android.** In Chrome, Edge or Samsung Internet.

1. Open the app and sign in. A strip appears at the bottom with an **Install**
   button — tap it.
2. If you dismissed that strip, tap the **three dots** at the top right and
   choose **Add to Home screen** or **Install app**.
3. Confirm. The icon lands on your home screen and in your app drawer.

**What you get, and what you do not:**

- **It is the same app.** One EDFL, one address. The icon is a faster door, not a
  separate copy, so it can never be a version behind the website and there is no
  app to update.
- **It launches full screen** and opens on your Team HQ.
- **It does not send phone notifications.** The icon adds no push alerts. The
  warnings the league does send — about fines, and about a poach window on one of
  your players — go by email or Discord direct message, as you choose on Owner
  Settings (HT 2.10), and reach you whether you installed this or not.
- **Nothing is lost if you skip it.** The app works in any browser on any device
  exactly as it does now.

![Put EDFL on your phone](../League%20Images/How-To/EDFL_HowTo_25_Install_on_Phone.jpg)

## HT 1.5 Finding a player

> **Answers:** How do I look a player up? Where is player search?

Type at least two letters into **Search players** in the app bar. Results appear
as you type and take you to that player's card (HT 4.1). It searches every player
in the league's pool, not only the ones on rosters.

## HT 1.6 Light and dark

> **Answers:** How do I switch to light mode? The app is too dark.

Two small buttons sit next to the EDFL mark in the app bar: a sun and a moon.
Press either. The choice is remembered on that device.

The screenshots in this manual are the dark theme. Everything is in the same
place in the light one.

---

# PART 2 — YOUR TEAM

## HT 2.1 Team HQ and the four tiles

> **Answers:** Where is my team? What is my cap room? What is my waiver
> priority? Where do I start?

**Fig. 1.** Team HQ is your home page — the EDFL mark in the app bar goes there,
and so does the app when you sign in.

Across the top, four tiles answer the four questions you ask most:

| Tile | What it is |
|---|---|
| **CAP ROOM** | What you have left under this season's cap. |
| **CASH** | Owner Cash left to spend this season. |
| **RECORD** | Your record, your rank by it, and your points for. |
| **WAIVER** | Your priority for the next run, out of ten. It is **provisional** while a week is being played, because priority is points for and those are still moving. |

Below the tiles: the compliance banner (HT 2.2), then four tabs — **Overview**,
**Roster**, **Money**, **Media**. If another team has opened a poach window on one
of your practice squad players, a **Poaching** strip appears on your own Team HQ
as well (HT 6.3).

You can open any other team's HQ from the Cap Sheet or the Standings. Another
owner's HQ has three tabs; the Media tab is yours alone.

![Team HQ, Overview tab](../League%20Images/How-To/EDFL_HowTo_01_TeamHQ_Overview.jpg)

## HT 2.2 The compliance banner

> **Answers:** Am I legal? What does the banner mean? Why does it say I am not
> compliant?

The banner sits above the tabs on every team page and answers one question: **is
this roster legal right now?**

- **IN COMPLIANCE** — green. The roster meets the in-season cap and roster rules.
- **NOT COMPLIANT** — it names each failing test in words, with the players
  involved where that helps.

The second line tells you which regime is in force and since when — *"In-Season
rules have applied since 8:00 PM ET, Tuesday, September 8, 2026 — rules 3.6(a)
and 5.5(f)"*.

**The banner is the answer, not the counters below it.** A count sitting at its
limit is marked, but being *at* a limit is not a failure. Read the banner.

Compliance is measured at **Thursday 00:00** each week (HT 3.1), not
continuously. Being out of compliance on a Tuesday costs nothing if you fix it
by Thursday.

### The red alert under the app bar

While your roster is at risk, a **red strip sits directly under the app bar on
every page**, not only on Team HQ. It reads the same rules the fines are charged
by, so the warning and the fine cannot disagree. It shows:

- **what is wrong**, problem by problem, with **To fix** beside each;
- **the deadline**, with a countdown;
- **the weekly roster fine** at stake — the full figure, and the reduced one if
  you cure in time (HT 3.4);
- **the next \$25 deadline** on each problem still open, and any player
  **scoring 0 this week** because he is over a limit;
- once a fine has been charged, that it is **already assessed**.

It goes away when you are compliant, and it cannot be switched off. The link at
its foot, **Choose how else you are warned**, opens Owner Settings (HT 2.10).

*Rule: RB 3.6. Fines: RB 6.7. What to do about it: HT 3.4.*

## HT 2.3 The Overview tab

> **Answers:** What is on my team's front page? Where are my roster counts?

**Fig. 1.** Four blocks, top to bottom:

**ROSTER.** Nine boxes. Four squads against their limits — Active (of 25),
Practice Sq (of 7), PS Non-Rookie (of 3), IR (of 10) — then your five positions
as **Active / IR / Practice Squad**, so *QB 2/0/3* means two quarterbacks on the
active roster, none on IR, three on the practice squad. A box at its limit is
marked in amber: a warning that you have no room, not a statement that you are
illegal. **A red figure is out of compliance** — the banner above says why.
**Click any box** to open the Roster tab listing just those players (HT 2.4).

**SALARY CAP.** Your committed cap against your ceiling, the room left, and
whether you have cleared the minimum spend. Exact figures are on the Money tab.

**THIS WEEK.** Your matchup, live, with a link to the full Matchup page (HT 8.4)
and to the Scoreboard.

**COMING UP.** The next few calendar entries that affect you (HT 3.3).

Further down: **Your recent moves**, **Draft Picks**, and the **owner directory**
(HT 2.7).

## HT 2.4 The Roster tab

> **Answers:** Where is my roster? What does each player cost me? What is dead
> money on this contract?

**Fig. 2.** Every contract you hold, one row each.

Above the table: a **season** picker, a **show** filter (all players, a squad, or
one position — the roster bar's boxes land here), and a **sort by** control (cap
hit, cash, PPV, name, position). Two colour keys tell you the contract type at a glance —
one dot for a **rookie deal**, another for a **practice squad deal**; everything
else is veteran free agency.

The columns:

| Column | What it means |
|---|---|
| **TYPE** | Veteran Free Agent, Rookie, Practice Squad, Fifth Year Option, and so on |
| **CONTRACT** | The span, with which year of it this season is — *2026–2028 (Yr 1/3)* |
| **PPV** | What the whole contract is worth to the player |
| **CAP HIT** | What he charges your cap this season |
| **CASH** | What he actually costs you this season |
| **DEAD IF CUT** | What cutting him would cost, with the part that lands next season shown separately |

**DEAD IF CUT is the column that surprises people.** A front-loaded contract can
cost you *more* against the cap cut than kept. The figure here is live from the
settlement engine, not an estimate.

Click any player to open his card (HT 4.1). The **Move** control on a row is how
you change his roster group (HT 5.1). On your own roster two more controls appear
where they apply: **Exempt** on a practice squad player (HT 6.3, *Keeping him
off the market*) and **Hold on active** on a player you have elevated (HT 5.3,
*Keeping him up*). Tags beside a name — `HELD ON ACTIVE`, `POACH EXEMPT` — say
which designation he carries.

![Team HQ, Roster tab](../League%20Images/How-To/EDFL_HowTo_02_TeamHQ_Roster.jpg)

## HT 2.5 The Money tab

> **Answers:** What is my cap in 2028? How much dead money do I have? What is my
> minimum spend?

**Fig. 3.** Five seasons across, the money questions down.

The **ASSUMED ANNUAL CAP GROWTH** control at the top lets you model future cap
inflation. **It applies to projected seasons only** — cap hit and cash committed
are contract facts and do not move whatever you set it to. A season is labelled
**SET** where the commissioner has set the base cap and **PROV** or **PROJ**
where the app is projecting it.

The rows: Salary Cap · Cap Ceiling · Cap Hit (with *of which dead money* beneath
it) · Cap Space · Min Spend (89%) · Cash Committed · and the cash rows beneath.

**Minimum spend** is the Season Cap Floor. Below it at the December 15 close and
the shortfall comes out of your Owner Cash.

*Rules: RB 5.3, 5.4, 5.5.*

![Team HQ, Money tab](../League%20Images/How-To/EDFL_HowTo_03_TeamHQ_Money.jpg)

## HT 2.6 The Media tab

> **Answers:** Where do I leak something? Where is Dianna? What is Insider
> Threat?

**Fig. 4.** This tab is drawn on **your own** Team HQ only. Nobody else sees it,
and you do not see theirs.

Four things live here:

1. **Dianna's card** — who she is and what she does.
2. **TELL DIANNA** — the submission form (HT 7.6).
3. **WHAT YOU'VE TOLD HER** — your own live submissions, each with the tier, how
   long it has left, and a **PULL IT** button. Pulling it before she prints means
   she never prints it. After that, the channel keeps it.
4. **WHAT SHE'S SAID** — her published copy, and **Mort's Thoughts** beneath it:
   one row per subject and direction, rated Maybe, Likely or Confirmed, with a
   trade proposal one step away.

*Rule: RB 7.9.*

![Team HQ, Media tab](../League%20Images/How-To/EDFL_HowTo_04_TeamHQ_Media.jpg)

## HT 2.7 Your owner card

> **Answers:** How do I change my contact details? Where is the owner directory?
> Who do I message about a trade?

At the foot of the **Overview** tab, below everything else, is the league
directory: one card per team with the owner's name, time zone, last-active band,
and whichever contact handles he has chosen to share.

**You edit your own card and nobody else's.** Press **EDIT** on your own, or use
**Contact info** on Owner Settings (HT 2.10). You choose, per field, what the
league can see. Your login email is shown to you
alone and is never shown to the league.

Last-active is shown as a rough band — *active today*, *active this week*, *not
seen in a week* — never as a time.

The commissioner and co-commissioner can see every owner's details and can edit
another owner's card, but they do it from a different page (HT 10.4), not from
here.

## HT 2.8 Your cash account

> **Answers:** Where did my cash go? How do I audit my Owner Cash?

Menu → **Cash account**. It shows the season's starting amount, every transaction
with the note explaining it, total spent on contracts, and the balance that
results.

**Available cash is always computed, never typed in.** If a number looks wrong,
the transaction that caused it is on this page, and if it was an officer
adjustment it is also in the Action Log (HT 8.11).

*Rule: RB 10.1.*

## HT 2.9 Designated cuts

> **Answers:** I set an end-of-week cut — where is it? How do I take it back?

If you have end-of-week cut designations that have not fired yet, a block appears
under the tabs on your own Team HQ listing them, each with **Withdraw**.

It is shown only to you and only when you have one. A designation can be
withdrawn, or turned into an immediate cut, at any time until it fires (HT 5.4).

## HT 2.10 Owner Settings and notices

> **Answers:** How do I get warned about fines? Can I get an email or a Discord
> message? How do I turn on automatic IR moves? Will I be told if someone tries
> to poach my player? Where did Notifications go?

Menu → **Owner Settings** (`/settings`). Three sections, all your own: **Roster
automation**, **Notifications** and **Contact info**. An old link to
`/notifications` lands here.

### Roster automation — the two IR switches

Two switches, **both off until you turn one on**. Each is a standing instruction
under the Rule Book, and you may turn either off at any time.

| Switch | What the app does |
|---|---|
| **Move players who lose their IR designation to the Active Roster** | A player on your IR whose designation stops qualifying is moved up — **even if that takes you over a limit**. That stops the 24-hour IR clock (HT 5.2); an overage it creates is a problem of its own (HT 3.4). |
| **Move injured Active Roster players to IR** | An active player who carries IR, Out, Doubtful or PUP is moved to IR — **only if you have an IR place open**. If you do not, nothing moves and you are told. A practice squad player is never touched. |

Three things to know:

- **No automatic move is made between a player's kickoff and the end of that
  league week**, so a move can never add or remove points already scored. It
  waits.
- **The moves are made in the app, not in Sleeper.** The commissioner mirrors them
  as he mirrors any other move.
- **Recent automatic moves** lists every move the app made for you, and every one
  it could not make, with the reason.

### Notifications — how you are warned

**In the app** is always on: the red strip under the app bar (HT 2.2) and, for
poaching, the strip on your Team HQ (HT 6.3). You may add any of three outside
channels:

| Channel | What it is |
|---|---|
| **Email** | To the address you sign in with, or to a different one you type in |
| **Discord direct message** | A private message from the league's bot. Nobody else sees it |
| **Public callout in #league-office** | The League Office names your team and the problem in the channel. Compliance only, and never a dollar figure |

**If you have never saved anything here, you get the in-app alert and email to
your login address.** Every outside channel can be switched off; the in-app alert
cannot. Press **Save**, then **Send me a test** — the test goes to the channels you
have saved, not the ones ticked on screen. **Your recent notifications** lists what
was sent and what is still waiting to send.

**When you are warned about fines:**

- The moment your roster goes out of compliance, whatever caused it.
- 24 hours and 2 hours before the weekly compliance deadline, if you are still
  out.
- Right after the deadline if you were out — fix everything before the week's
  first game kicks off and the roster fine is the reduced one — and again 2 hours
  before that kickoff.
- 2 hours before any \$25 attaches: 24 hours after the first game kicks off, 24
  hours after an IR player loses his designation, or the kickoff of a player over
  a roster limit.
- Whenever the app moves a player for you, or could not.
- Once more when you are back in compliance.

**When a team tries to poach your player:**

- The moment another team opens a poach window on one of your practice squad
  players. **Who opened it stays hidden** until the window resolves.
- 3 hours before the window closes, if you have not bid to keep him.
- Once more when it is settled: kept, poached or voided.

Poach notices use your email and Discord choices; the public callout is for
compliance only. Separately, Dianna announces every poach window to the whole
league in `#insider-threat`, without naming who opened it (HT 8.13).

**Every message says what is wrong, how to fix it, the deadline and the fine**,
with the amounts taken from the rules at the moment it is sent. **A warning that
cannot be delivered within six hours is dropped** rather than sent late with stale
figures.

**The app is the record.** The red strip is there on every page whether or not a
message reaches you. Whether a notice that never arrived could ever excuse a fine
is a question the Rule Book has not yet settled (Schedule B.17).

### Contact info

Your owner card (HT 2.7) — the same card, editable here as well as from the
directory.

*Rules: RB 1.10(c), RB 3.4(d), RB 6.7.*

---

# PART 3 — THE WEEKLY CYCLE

## HT 3.1 The four instants

> **Answers:** What happens on Tuesday? When does the wire run? When is
> compliance checked? What is the weekly cycle?

In season the league turns on **four fixed moments** every week, all Eastern.
They are set per week on the League Calendar and are **never worked out from the
day of the week**, because the NFL moves games.

| When | What happens |
|---|---|
| **Tuesday 00:00** | Weekly salary is charged **for the week about to be played**. The waiver wire opens with everyone cut since last Tuesday. Elevated practice squad players go back down automatically. |
| **Wednesday 00:00** | The wire runs. Claims are awarded; anyone nobody takes clears to free agency. |
| **Thursday 00:00** | **Compliance.** Every roster must be legal. The practice squad three-week counter ticks here. |
| **The week's last game** | End-of-week cuts fire and go to the wire. |

**Two consequences worth holding on to:**

1. **Salary is paid in advance.** A player cut before Tuesday 00:00 does not cost
   you that week. That single fact is why there are two cut timings (HT 5.4).
2. **Compliance is a moment, not a state.** You can be over a limit on a Tuesday
   and owe nothing, provided you are legal at Thursday 00:00. *(One exception:
   going over 25 active, three quarterbacks or three kickers **after** that moment
   costs you at kickoff — HT 3.4.)*

**Where a week's first game is a Wednesday**, that week's compliance moment moves
to **16:00 Wednesday**, before kickoff. In 2026 that is Week 12 only — Wednesday,
November 25.

**One more moment matters for fines: the week's first kickoff**, usually Thursday
night. A roster that is out at the compliance moment and fully fixed before that
kickoff pays the reduced roster fine (HT 3.4).

*Rule: RB 1.4(f).*

## HT 3.2 What you must do each week

> **Answers:** What do I have to do every week? Do I set a lineup?

**You never set a lineup.** Scoring is Best Ball: the highest-scoring eligible
player at each position across your whole active roster counts automatically,
bench included. Setting a lineup in Sleeper is cosmetic and changes nothing here.

What actually needs your attention each week:

1. **Before Thursday 00:00** — look for the red strip under the app bar, or at
   your compliance banner (HT 2.2). No strip and a green banner, and you are done.
   Owner Settings can warn you by email or Discord instead (HT 2.10).
2. **If you elevated someone from the practice squad**, he went back down at
   Tuesday 00:00 on his own. If you want him up for the coming week, **elevate him
   again before Thursday**.
3. **If you want a player off the wire**, put your claim in before Wednesday 00:00
   and rank it (HT 6.2).
4. **If you want to cut someone without paying him next week**, do it before
   Tuesday 00:00 — or use an end-of-week cut (HT 5.4).
5. **After Thursday 00:00, do not take your active roster over 25, or over three
   quarterbacks or three kickers.** The newest player over the limit scores zero
   if his game kicks off while you are over (HT 3.4). Make room first.

That is all. Everything else is optional.

## HT 3.3 Reading Coming Up

> **Answers:** What is coming up? When is the next deadline?

The **COMING UP** block on your Team HQ lists the next calendar entries, each
with its rule number and a sentence explaining it. Entries that involve you say
so — your waiver priority appears on the waiver run entry, for instance.

The full list is the League Calendar (HT 8.12). Coming Up is the short version.

## HT 3.4 Fixing a compliance failure

> **Answers:** My banner says I am not compliant — what do I do? How do I avoid
> the fine? How much is the fine? Why did my player score zero?

The banner — and the red strip under the app bar — names each failing test.
**Nobody fixes your roster for you.** Since October 4, 2026 the commissioner no
longer brings an in-season roster into compliance: you cure it yourself, and the
fines below run until you do.

### The schedule from Week 5 of 2026

```
THURSDAY 00:00 — THE COMPLIANCE MOMENT
│
├─ Legal? ──► nothing happens
│
└─ Not legal ──► ONE ROSTER FINE for the week,
    │            however many things are wrong
    │
    ├─ Fully legal before the week's FIRST KICKOFF?
    │   ├─ YES ─► $25
    │   └─ NO ──► $75
    │
    └─ Anything still wrong 24 HOURS AFTER THE FIRST
        KICKOFF?
        └─ YES ─► a further $25 PER UNIT still open
                  (one player over a limit is one unit)
```

| Fine | Amount | When |
|---|---|---|
| **Roster fine** | \$75, or \$25 if fully cured before the week's first kickoff | Once a week, if out at the compliance moment |
| **Escalation** | Both figures rise \$25 from your **fourth** roster fine of the season — \$100 / \$50, then \$125 / \$75 | |
| **Still open** | \$25 per unit | 24 hours after the first kickoff, for each problem there at the moment and still there |
| **IR without a designation** | \$25 | Once, when a player has held an IR place for 24 hours without IR, Out, Doubtful or PUP (HT 5.2) |
| **Over a limit after the moment** | The player **scores 0**, and \$25 where the overage is new | At his kickoff — see below |

**Over 25 active, three quarterbacks or three kickers after the compliance
moment.** The players over the limit are the ones **most recently added** to your
active roster. Each of them whose NFL game kicks off while you are still over
**scores zero for that week**, and each one beyond what you were already over by
at the compliance moment also draws \$25 at his kickoff. A player over two limits
at once is fined once. **This is the one that catches a mid-week signing**: win a
free agent on a Friday with 25 already active, and he — the newest — scores zero
unless you make room before his game.

**Fines are charged the following Tuesday at 16:00** and can take your Owner Cash
below zero. **A team with negative cash can make no transaction that costs
money**, which is the part that really hurts. The League Office posts each fine
with when and why it was incurred.

**Weeks 1–4 of 2026** ran on the former schedule — \$150, or \$50 if cured by
20:00 the same day, rising \$50 from the fourth. Those fines stand. The Rule Book
records that schedule in Schedule A.12.

**Common fixes, fastest first:**

| Problem | Fastest fix |
|---|---|
| Over 25 active | Send someone to the practice squad, if he is eligible; otherwise cut |
| Over 7 practice squad | Elevate someone, if you have an active place; otherwise cut |
| More than 3 non-rookies on the practice squad | Elevate or cut one of them |
| Over 10 IR, or someone on IR with no qualifying designation | Move him back to active — or let the app do it (HT 2.10) |
| Over the cap | Cut, trade, or restructure a contract (HT 4.3) |
| Cannot field the starting lineup | Sign or claim a player at the missing position |

**A player returning from injured reserve or suspension** is covered by the
rules above: while he sits on IR without a designation the 24-hour IR clock runs;
once he is back on the active roster, an overage he creates follows the
over-a-limit rule.

*Rules: RB 3.6, RB 6.7. Warnings: HT 2.10.*

---

# PART 4 — PLAYERS AND CONTRACTS

## HT 4.1 The player card

> **Answers:** Where do I see a player's contract? What would he cost to cut?
> Why does his card have a warning on it?

**Fig. 12.** Every player name in the app is a link to his card. It is the single
place that answers everything about one player.

**The header** carries his position, NFL team, EDFL team, roster group (a **TAXI
SQUAD** chip, say), and whether he is on a rookie deal. A **red cross** appears
beside his name if he carries **any** injury designation, Questionable included.
The cross does not mean he may hold an IR place — only IR, Out, Doubtful and PUP
do (HT 5.2).

**A warning band** appears under the header when there is something you need to
know — most often practice squad eligibility:

> *Practice squad eligibility — 1 of 3 weeks on an active roster used. Two more
> weeks on the active roster and his next promotion locks him there for the rest
> of the season.*

**Three value tiles** — TOTAL PPV, PER YEAR, and his tier on the Player Value
Chart, with the chart edition named and a link to the whole chart.

**Three tabs:**

| Tab | What is on it |
|---|---|
| **Overview** | This season's CAP HIT, CASH and **IF CUT NOW**; his week-by-week EDFL scoring this season; and his transaction history |
| **Contract** | The full contract, season by season, to the exact dollar |
| **Stats** | His NFL production by season |

**IF CUT NOW is a live settlement, not an estimate** — it includes any June 1st
split and names what would land next season. The figures on the Overview tab
round, so a charge never reads low; **the Contract tab has them exactly**.

![A player card](../League%20Images/How-To/EDFL_HowTo_12_Player_Card.jpg)

## HT 4.2 Reading a contract

> **Answers:** What do all these contract fields mean? What is a void year? Why
> is my cap hit different from his salary?

The Contract tab lays a contract out season by season. The fields:

| Field | What it is |
|---|---|
| **Guaranteed salary** | He gets it whatever happens. If you cut him, all of it that has not been charged accelerates onto this season. |
| **Non-guaranteed salary** | You can walk away. Cutting him forgives every week not yet charged. |
| **Signing bonus** | Paid to him in cash in full, at once. Against the cap it is spread evenly across every season of the deal, void seasons included. |
| **Roster bonus** | A lump sum that becomes real on September 2nd of its season. Cut him before that and it never happens. |
| **Option bonus** | Sits in Year 2 or later and triggers automatically on March 1st of its season, then prorates over exactly five seasons. |
| **Void season** | A season with no real salary, there only to hold bonus proration. |

**Three things that catch people out:**

1. **A void season defers a bonus; it never forgives it.** When the contract
   reaches the end of its last real season, every remaining prorated dollar is
   charged in full to the following season.
2. **Cap hit is not salary.** It is salary plus that season's share of every
   bonus.
3. **Salary is earned in fourteen weekly shares**, charged every Tuesday 00:00 in
   advance of the week. That is why cutting on a Monday and cutting on a Tuesday
   are a week apart in cost.

*Rules: RB 5.2, 5.7, 5.10, 5.18, 5.20.*

## HT 4.3 Restructuring a contract

> **Answers:** How do I get cap room now? What is a restructure? Why is this
> player greyed out?

**Fig. 18.** Menu → **Restructure a contract**.

A restructure converts salary you still owe **this season** into a signing bonus
paid now and spread over two to five seasons. You get cap room this season; the
player gets his money sooner and guaranteed. His total compensation never falls.

**Step by step:**

1. Open **Restructure a Contract**. Every contract on your roster is listed with
   its 2026 cap hit and an eligibility column.
2. **A greyed row cannot be restructured, and the reason is printed beside it** —
   *"A rookie contract cannot be restructured until after the completion of the
   player's third season. This player was drafted in 2025, so the contract is
   first eligible in 2028."* Read the reason; it is the rule, not a glitch.
3. Press **RESTRUCTURE** on a row that is eligible.
4. Choose how much to convert and over how many seasons (two to five).
5. **Read the preview.** It shows cap saved this season, the five-season cap
   picture, and dead money by season. Nothing has happened yet.
6. Confirm.

**What will refuse you, and why:**

| Refusal | Reason |
|---|---|
| Practice squad contracts cannot be restructured | RB 5.16 |
| A rookie contract before his third season is complete | RB 5.19(h) |
| Outside the window | Allowed March 1st to the trade deadline, and in the Dead Season — RB 5.19(a) |
| Only unpaid money converts | Weeks already earned at 1/14 are gone — RB 5.19(c) |
| The original signing bonus, a converted roster bonus, or a triggered option bonus | None of these can be converted — RB 5.19(c) |

**Reversal.** The commissioner or co-commissioner can reverse a restructure
within **96 hours**. After that it stands.

*Rule: RB 5.19.*

![Restructure a contract](../League%20Images/How-To/EDFL_HowTo_18_Restructure.jpg)

## HT 4.4 The Fifth Year Option

> **Answers:** How do I exercise a fifth year option? What does it cost? Which
> players are eligible?

Menu → **Fifth Year Option**, or the control on the player's card.

Only a **Round 1 pick** of an EDFL rookie draft is eligible. The decision becomes
available in the **third** season after his draft year, and the option season is
the **fourth**.

**The price is set by his tier**, which is fixed by his EDFL performance across
the three seasons of his draft-class window, on the published EDFL Pro Bowl
record:

| Tier | How you get it |
|---|---|
| **Tier 4** | Two or more EDFL Pro Bowls |
| **Tier 3** | One |
| **Tier 2** | No Pro Bowl, but a startable finish in at least two of the three seasons — QB 10th or better, RB 20th, WR 40th, TE 20th, K 10th |
| **Tier 1** | None of the above |

**The tier cannot move after you decide.** The Pro Bowl record is published once
and never recomputed.

**What exercising does:** it adds one real, **fully guaranteed** season to his
existing rookie contract. It extends that contract rather than creating a new one
— so if you cut him later, the option year's guarantee is dead money.

**Reversal.** An officer can reverse a decision within **96 hours**.

*Rule: RB 5.9(e)–(g).*

## HT 4.5 The Player Value Chart

> **Answers:** What is a player worth? Where is the value chart?

Menu → **Player Value Chart**. The commissioner publishes it; every previously
published edition stays available, and the edition a player card quotes is named
on the card.

**It is reference information only.** No bid has to match it, and a player's
absence from it does not stop you bidding on him. It is **not** a reference for
in-season free agency — it exists for the auction and for contract comparison.

*Rule: RB 6.5.*

---

# PART 5 — ROSTER MOVES

## HT 5.1 Moving a player between groups

> **Answers:** How do I elevate someone? How do I send a player down? Where is
> the Move button?

On the **Roster** tab of your Team HQ, each row has a **Move** control. It offers
the groups that player may legally go to, and the ones he may not are absent or
explained.

The three groups are **Active Roster**, **Practice Squad** and **Injured
Reserve**.

**Before you pick a destination**, the dialog shows any warning that applies —
most importantly the practice squad three-week counter (HT 5.3). Read it: the
move may be the one that locks him.

**If the move is refused**, the refusal names the rule. The commonest is that
the destination is full: you cannot elevate into a 25th place you do not have.
Make room first (HT 3.4).

**A player on the waiver wire no longer fills a roster place**, so cutting
someone immediately opens his place right away even though nothing has settled.

## HT 5.2 Injured reserve

> **Answers:** How do I put someone on IR? Why is my IR player flagged? What
> counts as injured?

Move him to **Injured Reserve** from the Roster tab, exactly like any other move.

**Only four designations qualify:** **Injured Reserve, Out, Doubtful** and
**PUP**. Those four, and no others, mark a player injured in the app and are the
only ones that let him hold an IR place. Questionable does not. NA does not.

The **red cross** beside a name shows any designation at all, Questionable
included. It tells you he is listed, not that he is IR-eligible; a roster row
that cannot hold an IR place says `NOT IR ELIGIBLE`.

Designations come from Sleeper through a daily pull at 17:00 ET. The Injury
Report (HT 8.8) shows the last pull and when it ran.

**A placement of a player with no qualifying designation is flagged, not
refused.** The move goes through and your compliance banner raises it with the
player named. That is deliberate — a player legitimately on IR whose designation
clears the following week would otherwise be a mess to unwind.

**But a clock starts.** From the moment a player on your IR is without a
qualifying designation — placed that way, or his designation cleared — you have
**24 hours**. Still there after that and it is **\$25**, once for each lapse. The
red strip shows the moment it attaches. Move him to active, or let him regain a
designation, and the clock stops.

**Or let the app do it.** Owner Settings has two switches (HT 2.10): one moves a
player who loses his designation back to active, the other moves an injured
active player onto IR when you have a place. Both are off until you turn them on.

**There is no cap or cash relief for a player on IR.** He costs exactly what he
costs on the active roster.

**Practice squad players cannot go straight to IR.** Elevate first. *(For 2026
only, a player on a rookie contract may move directly between the practice squad
and IR.)*

*Rules: RB 3.4, RB 3.3(f), RB 6.7(h).*

## HT 5.3 The practice squad — decision tree

> **Answers:** Who can be on my practice squad? What is the three-week rule? Why
> can't I send this player back down? What does "locked" mean?

### Who can be down there at all

```
WHO CAN BE ON THE PRACTICE SQUAD?
│
├─ A DRAFTED ROOKIE ─────────────────────── YES
│     Within two seasons of his draft class — the 2025
│     and 2026 classes in 2026 — on his rookie contract
│     at its normal dollars.
│     Eligibility runs from the CLASS, not the contract.
│     A trade does not restore it.
│     May fill any of the 7 places.
│
├─ A NON-ROOKIE ON A PRACTICE SQUAD DEAL ── YES
│     One year, total cash at or under the league
│     minimum ($9 in 2026). Signed through free agency,
│     or converted by the commissioner from a qualifying
│     one-year minimum contract.
│     At most 3 of your 7 places may hold these.
│     The contract expires the Tuesday after Week 17.
│
└─ ANYONE ELSE ──────────────────────────── NO
      Active roster or injured reserve only. A veteran on
      a normal contract never sits on the practice squad.
```

**What he costs down there.** Full Owner Cash, like anyone on your roster.
Against the cap, his bonuses and guaranteed money count in full; **his
non-guaranteed salary does not count while he is on the practice squad**. He
never scores — Best Ball counts the active roster only.

### Elevating, and the three-week counter

```
YOU ELEVATE HIM TO THE ACTIVE ROSTER
│
├─ Is there an open active place (25)?
│   │
│   ├─ NO ──► THE MOVE IS REFUSED
│   │          Make room first: an immediate cut opens the
│   │          place at once; or trade; or send another
│   │          player down. A player already on the wire no
│   │          longer fills a place.
│   │
│   └─ YES ──► he is on the active roster
│
├─ THURSDAY 00:00 — the compliance moment
│     On the active roster at this instant = ONE WEEK on
│     his counter, whether or not you send him down
│     afterwards.
│     His player card and your cap sheet show the count
│     and a warning.
│
├─ TUESDAY 00:00 — he goes back down by himself
│     Automatic. It is not an acquisition, so it ALWAYS
│     completes — even if it puts your practice squad over
│     7. You then have until Thursday to cure that.
│     Want him up again this week? Re-elevate before
│     Thursday 00:00 — OR HOLD HIM (below) and he stays.
│     A locked player is never sent back down.
│     He is poachable again 24 hours after he goes down.
│
└─ Three weeks on his counter?
    │
    ├─ NO ──► STILL FREE
    │          Elevate and send down as often as you like
    │          until the counter reaches three.
    │
    └─ YES ─► THREE WEEKS: ONE TRIP DOWN LEFT
               He can go back to the practice squad ONCE
               more. He locks onto the active roster for
               the rest of the season on the earlier of:
                 (A) your NEXT call-up, or
                 (B) a FOURTH Thursday on the active roster.
```

### Keeping him up — the hold (Rule 3.3(d)(i))

> **Answers:** Can I stop the Tuesday return sending my rookie back down? How do I
> keep an elevated practice squad player on my active roster?

Yes. Two ways to set it:

- **When you elevate him.** In the Move dialog, pick *Active roster* and tick
  **Keep him on the active roster until I move him down**. The move is made first;
  the hold is set right after it.
- **Any time he is up.** On the Roster tab his row shows **Hold on active** while
  he is a player the Tuesday return would move. Press it. The row then carries
  `HELD ON ACTIVE` and the button reads **Release hold**.

What a hold does and does not do:

- The Tuesday 00:00 return **skips him**. He stays on your active roster until you
  move him down yourself (Move → Practice squad), cut him, or trade him.
- **It does not stop the three-week counter.** Every Thursday he is up counts, and
  the fourth counted week locks him on the active roster for the season exactly as
  if you had re-elevated him each week. The hold is a convenience, not a loophole.
- The hold ends the moment he leaves the active roster by any path, and it does
  not come back on its own — re-elevate him and set it again.
- The app refuses a hold on a player who is not on your active roster, who is not
  practice squad eligible, who is locked, or who was not elevated from the
  practice squad. The refusal says which.

### When the lock falls

```
LOCKED ON THE ACTIVE ROSTER
│
├─ His money does not change.
│     A practice squad contract becomes an ordinary active
│     contract AT THE SAME MONEY. A rookie contract is not
│     touched at all. Promotion can never cost a player
│     money.
│
├─ Nobody can send him back down — the commissioner
│   included.
│
└─ THE ONLY WAY BACK
      Cut him → he clears waivers (nobody claims him) →
      his counter resets to zero and the lock lifts →
      sign him to a NEW one-year practice squad contract.
      A rookie contract does NOT survive that: he comes
      back on a practice squad deal at the practice squad
      maximum, or not at all.

      A player CLAIMED off waivers keeps his count and his
      lock — he did not clear, a team took him.
      EXCEPT: if the team that claims him is the team that
      waived him, the count resets and the lock lifts, just
      as clearing would.

      A player POACHED off your squad keeps his count. A
      poach is a signing, not a clearance.
```

**Two 2026-only allowances:** Week 1 of 2026 does not count, so counting started
at Thursday, September 17; and weeks on injured reserve do not count in 2026,
though they will from 2027.

**A move between the practice squad and injured reserve, in either direction, is
not a call-up** and never triggers the lock.

*Rules: RB 3.3, RB 5.16.*

## HT 5.4 Cutting a player — decision tree

> **Answers:** How do I cut someone? Immediate or end of week? When do I stop
> paying him? What will it cost me?

### Which cut, and when

```
YOU WANT TO CUT A PLAYER
│
├─ Is it the off-season or Dead Season?
│   │
│   └─ YES ──► IMMEDIATE RELEASE, NO WIRE
│               He is released straight away; there is no
│               off-season waiver wire yet. Dead money
│               settles now and the app shows the exact
│               settlement before you confirm. June 1st
│               treatment may apply.
│               NO CUTS AT ALL during the League Reset
│               Period, February 21–28.
│
└─ NO — it is in season
    │
    ├─ Do you need his roster place RIGHT NOW?
    │   │
    │   ├─ YES ──► IMMEDIATE CUT
    │   │           • His roster place opens now.
    │   │           • He goes on the waiver wire at once.
    │   │           • Your cap and cash show the WORST CASE
    │   │             — as if he clears — until the run.
    │   │           • You cannot take it back. Only the
    │   │             commissioner can reverse a cut, and
    │   │             only to settle a ruling.
    │   │
    │   └─ NO ───► has his NFL game this week kicked off?
    │               │
    │               ├─ YES ─► It is an END-OF-WEEK CUT by
    │               │          rule. The app forces it and
    │               │          disables "Cut now".
    │               │
    │               └─ NO ──► you may choose either
    │
    └─ END-OF-WEEK CUT — a designation, not a cut yet
          • He keeps his roster place and keeps scoring
            this week.
          • Every owner can see it.
          • Change it to an immediate cut, or withdraw it,
            any time until it fires.
          • Trade him first and it dies — it does not
            travel with him.
          • He still fills a roster place, so it CANNOT
            make you compliant.
          • It fires after the week's last game and he
            goes to the wire then — before Tuesday's
            salary, so he never costs you next week.
```

### When you stop paying him

Salary is charged every **Tuesday 00:00** for the week about to be played.

- On the wire **before** Tuesday 00:00 → you do not pay him that week.
- An end-of-week cut fires after the last game, **before** Tuesday → he never
  costs you the following week.
- **While he is on the wire he is charged to no one.** The week attaches to
  whoever holds him after the run, or to nobody if he clears.

### Which run decides him

**The Wednesday 00:00 run after the next Tuesday 00:00.** Everyone cut between
one Tuesday 00:00 and the following Monday 23:59 is on the same run.

| Cut at | Run |
|---|---|
| Wed Sep 16 | Wed Sep 23 |
| Mon Sep 21, 23:00 | Wed Sep 23 |
| Tue Sep 22, 00:01 | Wed Sep 30 |

### What the cut costs

Settled at the run, computed through the week of the waive.

| Money | What happens |
|---|---|
| **Non-guaranteed salary** | Weeks already charged stay. Every uncharged week, this season and future, is forgiven. |
| **Guaranteed salary** | Everything not yet charged accelerates onto this season, cap and cash. It never splits or defers. |
| **Signing / option / restructure bonus proration** | This season's share stays. Future seasons' shares accelerate onto this season's cap — or land on next season under June 1st treatment. Bonus cash is never refunded. |
| **Roster bonus** | Forgiven if you cut before September 2nd; stays charged if after. |

**A cut does not always free cap space.** A front-loaded contract can cost more
cut than kept. The app shows you the exact settlement before you confirm — read
it.

**The cut dialog shows Dead against Saved**, in two tables — **Cap** and
**Cash** — season by season, with a total. **Dead** is what the cut charges you;
**Saved** is what keeping him would have cost and now will not. Dead money is red
and a saving green; **a negative saving is red too**, because it means the cut
costs more than keeping him; a zero is dimmed.

**June 1st treatment.** A cut between March 1st and May 31st may be designated a
June 1st cut, pushing future bonus proration to next season. **Two designations
per team per league year.** Cuts from June 1st through February 20th get the same
split automatically and use no designation.

*Rules: RB 5.23, RB 5.18, RB 5.15.*

*Next: the wire — HT 6.2.*

---

# PART 6 — GETTING PLAYERS

## HT 6.1 In-season free agency — decision tree

> **Answers:** How do I sign a free agent? What is a window? Why can't I offer on
> this player? Can I withdraw an offer?

**Fig. 13.** Menu → **Free Agency**.

### Can you offer on him at all

```
YOU WANT A PLAYER NOBODY HOLDS UNDER CONTRACT
│
├─ Is he on the waiver wire?
│   │
│   └─ YES ──► HE MUST CLEAR WAIVERS FIRST
│               A player cut in season cannot be offered on
│               until the run has passed him over. Watch the
│               Wednesday 00:00 run (HT 6.2).
│
└─ NO
    │
    ├─ Is a window already open on him?
    │   │
    │   ├─ YES ─► OFFER INTO THE OPEN WINDOW
    │   │          Before it closes. You cannot see the other
    │   │          offers — only that the window is contested.
    │   │
    │   └─ NO ──► YOUR OFFER OPENS A 24-HOUR WINDOW
    │              The clock starts when the app accepts your
    │              first valid offer. Anyone may offer into it
    │              until it closes. One open window per player.
```

**Who can be offered on:** anyone holding no active EDFL contract. A player
released in season must clear waivers first. Free agency runs from the start of
the In-Season to the end of the regular season — **Monday December 14, 2026**.

### Writing the offer

**An offer is a complete contract**, and it must pass every rule that governs
writing one: the league minimum (\$9 in 2026), the Deion Rule and the 30% Rule.

Two shapes:

| Shape | Terms |
|---|---|
| **Active roster deal** | Any legal length up to five years. Void years allowed. **No roster bonus and no option bonus in the signing season.** |
| **Practice squad deal** | One year. **Total cash at or under the league minimum.** No roster bonus, no option bonus, no void year. Exempt from the Deion Rule. Takes one of your three non-rookie practice squad places. |

**Revision rules — this is the part people get wrong:**

- You may **revise upward** while the window is open.
- You may **not withdraw**, and you may not revise downward. There is no Withdraw
  button and there is not meant to be one.
- You may change a **practice squad offer into an active one**. You may **not** go
  the other way.
- A revision **keeps its original timestamp**, so improving your own offer never
  costs you the tie-break.

The **Contract Assistant** will draft a legal offer for you if you would rather
not write one from scratch. On the offer form, **Seasons** (1 to 5) and **Void
years** are drop-downs, so a phone can enter any legal length.

### The clock and the seal

- **24 hours** from the first valid offer.
- **Sealed.** Nobody — not even the commissioner — sees any offer or who made it.
  The only public fact is whether the window is **contested**.
- When it resolves, **every offer is published with the team named**.
- Free agency never pauses for a waiver run. It pauses only if an auction tier is
  open.

### How offers are compared

**Total PPV**, one number for the whole contract. Signing bonus counts 100% in
Year 1; guaranteed salary 95% falling to 75%; roster bonus 50% falling to 10%;
option bonus 90% in Year 2 falling to 60%; non-guaranteed salary only 30% falling
to 5%.

The lesson: **guaranteed money and signing bonus buy you far more PPV per dollar
than non-guaranteed salary does.**

### Resolution and the gates

```
THE WINDOW SETTLES ITSELF
within a minute of closing
│
Highest total PPV wins, at exactly the terms offered.
Ties go to the EARLIEST offer; a revision keeps its
original timestamp.
│
Then the gates, in order, on the best bid:
│
├─ Enough Owner Cash for this season's charge?
│   └─ NO ──► PASSED OVER
├─ Still under the salary cap after him?
│   └─ NO ──► PASSED OVER
├─ Within 28 active (or 9 practice squad) after him?
│   └─ NO ──► PASSED OVER
│
└─ ALL YES ──► AWARDED

PASSED OVER: the next-highest offer wins at its own terms
and is tested the same way. If no offer survives, the
window VOIDS and the player stays a free agent — the next
offer on him opens a new window.
```

**Cash and the cap are hard.** The roster maximums are not: an award may take you
to **28** active or **9** practice squad, and you then **owe a move** by the next
compliance instant. Having three non-rookies on your practice squad already does
not block a fourth arriving; it just means you owe a move.

### Mid-season money

This season's salary is charged only for the weeks he is under contract, **out of
fourteen** — a Week 8 signing charges 7/14. **The signing bonus is charged in
full.** Later seasons are charged as written. He earns the week he signs in,
whatever day it is — and **the week he signs in is the week the window closed**,
however late it was settled.

### When you win

- At exactly the terms you offered. Every offer on him is published with the team
  named.
- An active offer lands him on your active roster; a practice squad offer on your
  practice squad.
- Over 25 active or 7 practice squad? You owe a move by Thursday 00:00 or it is a
  fine.
- The commissioner mirrors the signing in Sleeper.

*Rule: RB 5.14.*

![Free Agency](../League%20Images/How-To/EDFL_HowTo_13_Free_Agency.jpg)

## HT 6.2 The waiver wire — decision tree

> **Answers:** How do I claim a player? What is my priority? Can I claim back
> someone I cut? When does the wire run?

**Fig. 14.** Menu → **Waiver Wire**.

The page shows a countdown to the next run, your priority out of ten, everyone on
the wire, and your own claims in the order they will be tried.

### Claiming — until the run

```
A PLAYER LANDS ON THE WIRE
│
├─ Any team may claim him — INCLUDING the team that cut
│   him.
├─ Claims are SEALED. Nobody, not even the commissioner,
│   sees them until the run; then all are published.
├─ You rank your own claims, top to bottom.
├─ A claim may name ONE player of yours to be cut if it
│   wins — a conditional cut.
└─ Withdraw or re-rank any time before the run.
```

**Your priority** is season-to-date **points for, lowest team first**, ties to
most points against. It is **positional, not consumable**: winning a claim does
not move you down the order. It is frozen at the moment the run starts, so a
later scoring correction can never change who won.

### The run — Wednesday 00:00

```
EACH PASS OF THE RUN
Every team, in priority order, gets ONE attempt: its
highest-ranked claim that is still live. Then the run goes
round again — until a pass awards nothing.

For each team's top live claim:
│
├─ Enough Owner Cash for the rest of his season?
│   └─ NO ──► PASSED OVER
├─ Still under the salary cap after him?
│   └─ NO ──► PASSED OVER
├─ Within 28 active / 9 practice squad, after your
│   conditional cut?
│   └─ NO ──► PASSED OVER
│
└─ ALL YES ──► AWARDED — he is yours

PASSED OVER means the claim goes to the NEXT TEAM in the
order — not to your own next claim. Your turn this pass is
used; your next-ranked claim tries on the next pass.
```

**The run is never reversed.**

### If you win him

- **On his existing contract** — same dollars, same years. You are not writing a
  new deal.
- Salary from the waive forward is yours, and **you pay the full week you take
  him in**.
- His bonus proration **stays with the team that cut him**.
- A practice squad contract lands on your practice squad; anyone else on your
  active roster.
- Over 25 active or 7 practice squad? You owe a move by Thursday 00:00.
- **His practice squad week count and any lock come with him.**

### If nobody takes him

- He becomes **a free agent immediately** and can be offered on (HT 6.1).
- The team that cut him settles its dead money as an ordinary release.
- **His three-week practice squad counter resets to zero and any lock lifts.**

### Claiming back your own player

You may claim a player you cut. He comes back on the same contract, settled like
any other claim: salary from the waive forward is yours again, and the cut's
bonus acceleration stands.

**A self-claim resets his three-week practice squad counter and lifts any lock —
the one claim that does.** That is the route back for a player you locked onto
your active roster by accident.

### While he is on the wire

His roster place is **already open** — you can sign a replacement into it. Your
cap and cash show the **worst case**, the clear-waivers settlement, until the run
decides.

*Rule: RB 5.15.*

![The waiver wire](../League%20Images/How-To/EDFL_HowTo_14_Waiver_Wire.jpg)

## HT 6.3 Poaching — decision tree

> **Answers:** How do I poach someone off another team's practice squad? Can I
> keep my own guy? What is the rookie bar? What is the \$75 fine? Will I be told
> if someone tries to poach my player?

**Fig. 15.** Menu → **Poaching**.

The page shows whether poaching is open, then **your own exposure first** — every
player on your practice squad and the bar on each — then every other squad.

### Can you open a window

```
YOU WANT TO POACH A PLAYER
│
├─ Is poaching open right now?
│   │
│   └─ NO ──► NOT NOW
│              Poaching runs Wednesday September 23, 12:00 PM
│              to Saturday December 12, noon. Outside those
│              times no new window can be opened. A window
│              opened before the cutoff runs its full 24
│              hours.
│
└─ YES
    │
    └─ Can HE be poached?
        │
        ├─ NO ──► NOT HIM
        │          • He must be on ANOTHER team's practice
        │            squad, on a rookie or practice squad
        │            contract.
        │          • Not on the waiver wire, and not
        │            designated to be cut at end of week.
        │          • Not already under a window — bid into
        │            that one instead.
        │          • Not EXEMPT. His team may mark two of its
        │            practice squad players exempt; the board
        │            shows EXEMPT on them.
        │          • Not back from the active roster inside the
        │            last 24 hours — the board says when he
        │            becomes poachable.
        │          • Not your own player. You may only bid to
        │            keep him once someone else opens a window.
        │
        └─ YES ─► WRITE A LEGAL POACH BID
```

### Keeping him off the market — the exemption (Rule 5.17(l))

> **Answers:** How do I protect a practice squad player from being poached? How
> many can I protect? Do other owners see it?

You may mark **up to two** of your practice squad players **exempt from poaching**
at a time. Nobody can open a window on an exempt player.

- **Where:** on `/poaching` under **Your exposure**, each of your players carries
  **Exempt from poaching** (or **Release exemption**); or on your Roster tab, the
  **Exempt** control on any practice squad row. Either place, one press.
- **The limit is two at a time.** A third is refused with the rule's sentence;
  release one first. Swap whenever you like.
- **It stands until you release it or he leaves the practice squad** — promoted,
  moved to IR, cut or traded. Then it is gone and **does not come back on its
  own**: if he goes up and comes back down, mark him again.
- **You cannot exempt a player who already has a window open on him.** The
  exemption stops a window opening; it never closes one.
- **Everyone sees it.** The league list shows `EXEMPT` on the row and offers no
  bid. That is a ruling, not an oversight.

A separate protection needs no action from you: a player who was on your active
roster is **not poachable for 24 hours** after he returns to the practice squad
(Rule 5.17(m)). After the Tuesday 00:00 return that means Wednesday 00:00.

### A legal poach bid

Your bid opens the window. **Every** bid — yours, a rival's, the holding team's —
must be:

- **An active roster contract.** A poached player goes straight to the winner's
  active roster, never to a practice squad.
- **A signing bonus of at least \$2.**
- **No roster bonus and no option bonus, in any year.** Ordinary void years are
  allowed.
- **First-year cash** (salary plus signing bonus) of at least the league minimum
  **and at least what he already earns this season**.
- **Every later season:** at least that season's minimum **in salary alone**.

> **THE TWO RULES THAT FAIL MOST.** A second or third year below that season's
> minimum — the signing bonus counts only in year one. And a first year that pays
> him less than he already earns.

### The window

- **24 hours**, sealed. No bids and no opener are shown until it resolves.
- Any team may bid, **including the team that holds him**.
- No withdrawing and no lowering. You may replace your bid with a higher one; it
  keeps its original time.
- **He is frozen:** no move, cut, trade or restructure until it resolves, and his
  owner cannot elevate him.
- **His owner is told.** The moment a window opens on one of your practice squad
  players, a **Poaching** strip appears on your Team HQ with **Bid to keep him**,
  and a notice goes to the channels you chose on Owner Settings (HT 2.10) — with
  a last call 3 hours before it closes if you have not bid. Who opened it stays
  hidden.
- **The league is told too.** Dianna announces every poach window in
  `#insider-threat`, naming the player, his team and the rookie bar — never who
  opened it.

### Resolution

```
THE WINDOW SETTLES ITSELF
within a minute of closing
│
Bids ranked by total PPV. A tie goes to THE TEAM THAT
HOLDS HIM, then to the earliest bid.
│
├─ Is he on a rookie contract?
│   │
│   ├─ YES ─► Is any bid worth MORE than his rookie bar?
│   │          (the bar is his rookie contract's total PPV,
│   │           measured when the window opened)
│   │          │
│   │          ├─ NO ──► HE STAYS, ON HIS ROOKIE CONTRACT
│   │          │          Nothing changes for the holding
│   │          │          team — it need not even bid. The
│   │          │          team that OPENED the window pays a
│   │          │          $75 fine to the League Fund.
│   │          │
│   │          └─ YES ─► carry on to the gates
│   │
│   └─ NO — practice squad contract, no bar ─► gates
│
├─ Is the bid legal, and is he still on that squad on that
│   contract?           └─ NO ──► PASSED OVER
├─ Enough Owner Cash for this season's charge?
│                       └─ NO ──► PASSED OVER
├─ Still under the salary cap after him?
│                       └─ NO ──► PASSED OVER
├─ Within 28 active players after him?
│                       └─ NO ──► PASSED OVER
│
└─ ALL YES ──► whose bid won?
```

```
NO BID LEFT ──► NOBODY WINS — HE STAYS
   The window is VOID. He stays on his contract with his
   team, and there is NO FINE: someone beat the bar, or
   there was no bar, but no bid passed the tests. Another
   team may open a new window.

THE TEAM THAT HOLDS HIM ──► KEPT, ON A NEW CONTRACT
   • The winning bid replaces his old contract at exactly
     its terms.
   • He moves to your ACTIVE ROSTER and cannot return to
     the practice squad this season.
   • The old contract settles as below.

ANOTHER TEAM ──► POACHED — HE IS THEIRS
   • At exactly the terms bid, straight onto the winner's
     active roster.
   • Over 25 active? The winner owes a move by Thursday
     00:00, as with any signing.
   • Every bid is published with the team named.
```

### The money

**The old contract** settles like a trade. The holding team keeps what it has
already been charged, **including this season's signing bonus proration**. Future
seasons' proration lands on next season. **Salary not yet earned is forgiven.**

**The new contract** charges this season's salary for the weeks left, out of
fourteen. The signing bonus is charged in full. Later seasons as written. The cap
is a hard limit throughout.

**His practice squad counter comes with him** — a poach is a signing, not a
clearance. A player kept by his own team's winning bid is locked onto that team's
active roster for the season.

*Rule: RB 5.17.*

![Poaching](../League%20Images/How-To/EDFL_HowTo_15_Poaching.jpg)

## HT 6.4 The rookie draft

> **Answers:** When is the draft? Where is it held? How is the order set?

The rookie draft is held in **Sleeper**, not in this app, starting **July 1st at
08:00 ET**. Four rounds, **repeating linear order** — 1 through 10, then 1
through 10 again. It is not a snake. You have 24 hours per pick and trading a
pick does not reset the clock.

The app records the results. **Draft Picks** (HT 8.7) shows every pick the league
has or will have, who owned it originally, who owns it now, who was taken with
it, and what has happened since.

Your rookie's contract is set entirely by the Rookie Wage Scale from his EDFL
draft slot. There is no negotiation and nothing to type in.

*Rules: RB 4.1–4.3, RB 5.8–5.9.*

## HT 6.5 The auction

> **Answers:** What happened to the auction? Can I still bid?

The Blind Bid Auction built the league's first rosters and is **dormant** — it is
kept, not deleted. There is deliberately no menu link to it while it is dormant.

If the commissioner ever opens a tier again, in-season free agency pauses: no new
window opens and a running window freezes until the tier is verified.

*Rule: RB 6.1.*

---

# PART 7 — TRADES AND THE MARKET

## HT 7.1 Proposing a trade

> **Answers:** How do I propose a trade? Can I trade picks? Who sees my proposal?

**Fig. 16, Fig. 17.** Menu → **Propose a trade**, or the button on the Trades
page.

1. **Who is involved.** Your team is always in it. Pick at least one more. More
   than two teams is allowed.
2. **What moves.** Pick players and draft picks from each team's assets. Picks up
   to three years out are tradeable.
3. **Check the impact.** Each team's card shows its cap and its cash **by
   season** — Season, Dead, Saved, Added and Net, with a total — the same figures
   on the builder, on the trade's own page and in the commissioner's queue. Dead
   is red and a saving green, as in the cut dialog (HT 5.4).
4. **Send it.**

**Who can see it:** only the owners party to it, until **every** party has
accepted. **Not the commissioner, and not the co-commissioner** — both are
competing owners and there is nothing to approve until everyone has agreed. A
draft you have not sent is visible only to you. A declined, cancelled or expired
proposal stays private to its parties permanently.

**What cannot be traded:** Owner Cash, cap space, dead money, real money, favors,
votes, or a promise of an asset further out than three years.

**Conditions** can be attached only to a **future draft pick** — highest-of,
lowest-of, protected, or a performance trigger — and a pick may carry only one.
Conditions are recorded with the trade and adjudicated by the commissioner by
hand.

*Rules: RB 7.1, 7.2, 7.3, 7.6.*

![Trades](../League%20Images/How-To/EDFL_HowTo_16_Trades.jpg)

## HT 7.2 Accepting or declining

> **Answers:** Someone sent me a trade — what do I do? When does it become real?

**Fig. 16.** The **Trades** page puts **AWAITING YOUR ACCEPTANCE** at the top:
what you send, what you get, when it was proposed, and how many parties still
have to accept.

Open it and accept or decline.

**Three moments, and they are different:**

| Moment | What it means |
|---|---|
| **The last party accepts** | The trade becomes public and **the settlement is fixed at this instant** — the June 1st boundary, the roster bonus conversion, the weekly accrual count, all taken now. |
| **An officer approves** | Processing. Normally 24 hours. |
| **It executes** | The players and picks actually move. |

A trade accepted on September 1st and approved on September 3rd is settled as a
**September 1st** trade.

**A player mid-trade may not be used on either team's active lineup** during
processing. That is a Sleeper-side rule; the app states it but cannot enforce it.

**The commissioner and co-commissioner both recuse** from any trade involving
their own team — the app refuses to let them execute it.

**Reversal.** The commissioner may reverse an executed trade within **96 hours**,
with a public reason, and only while everything it moved is untouched. A reversed
trade is never erased; it stays on the record marked reversed.

*Rules: RB 7.6, 7.7.*

## HT 7.3 Overlapping offers

> **Answers:** Can I offer the same player to two teams? What happens if both
> accept?

Yes. **You may name the same player or pick in any number of open proposals**, to
the same owner or to different ones. **Offering a player does not reserve him.**

Only a trade **every party has accepted** reserves an asset. On the last
acceptance, that trade takes the player or pick, and **every other open proposal
naming the same asset is cancelled automatically**, with the reason recorded and
shown to the owners affected.

Where two offers are accepted at the same moment, the first to complete takes the
asset and the second is refused. An owner whose offer was superseded is free to
make another.

*Rule: RB 7.6(d).*

## HT 7.4 The trade block

> **Answers:** How do I advertise a player? How long does a block last? Why is my
> player still on the block?

Mark any player you hold as available. **It binds you to nothing.**

- **A block lasts 14 days.** You can take it down at any time and your removal is
  absolute.
- **If anyone has your player on a watchlist at the 14-day mark** — at any tier —
  **the block stays up**, and falls off the moment the last interest goes.
- An expired block is not revived by new interest; only you re-marking him
  restores it, and re-marking resets the 14 days.
- **The block dies with the contract** — cut, traded, or the moment he is waived.
  A restructure neither ends it nor resets it.

**Two consequences, both intended:** a block still standing after two weeks tells
the league somebody wants him; and a rival can keep your player on the block by
leaving his interest there.

**Shopping a player you hold on the rumour desk puts him on the block too**,
whatever tier you pick, and resets the clock if one is standing.

*Rule: RB 7.9(a).*

## HT 7.5 The watchlist

> **Answers:** How do I mark interest in someone else's player? Who can see it?
> What does private mean?

Mark interest in any player you do not hold, at a tier you choose **per player**:

| Tier | Who sees it |
|---|---|
| **Private** | The league sees it only **in aggregate, without names** |
| **Shared with his owner** | That owner sees it is you |
| **Public** | The whole league sees it is you |

**Private means unattributed, not hidden.** The aggregate is neither bucketed nor
lagged, so an owner who works out it is you has broken no rule. **The
commissioner has no special read of it** — he is a competing owner.

You may change a tier at any time in either direction, but **visibility runs
forward only: what was public cannot be made retroactively unseen.** When a
player changes teams, a shared-with-owner marker reverts to private.

**Your watchlist never reaches the rumour desk.** Not automatically, not by
suggestion, not in aggregate. If you want Dianna to know, you type it.

*Rules: RB 7.9(b), 7.9(d).*

## HT 7.6 Telling Dianna

> **Answers:** How do I leak something? What are the three tiers? Does it have to
> be true?

**Fig. 4.** Media tab on your own Team HQ → **TELL DIANNA**.

One claim at a time:

1. **A subject** — one player, one draft pick, or one rookie prospect.
2. **A direction** — acquire, shop, sign a free agent, release, or draft.
3. **Optionally** what you would give and what you want.
4. **A tier.**
5. **A delay** — now, tonight, or this week.

**The three tiers:**

| Tier | How it prints | Rated |
|---|---|---|
| **Leak** | As a rumour, nobody named or implied | Maybe |
| **Off the record** | As confirmed, with Dianna declining to say who told her | Likely |
| **On the record** | As confirmed, with your team named | Confirmed |

**You may only talk about another owner's plans at the leak tier.** Off the
record and on the record are for your own players, picks and intentions. Dianna
never names a third party as a source.

**A submission does not have to be true.** You may file a leak you know to be
false. Everyone is told that here, in advance, so nobody who acts on a rumour has
a grievance for having believed it.

**Shopping a player you hold puts him on the trade block** (HT 7.4), whatever
tier you pick. An owner who shops on the record has advertised him twice — in
Dianna's copy with his own name on it, and on the league block. An owner who
wants neither does not submit.

**Lifespan.** A submission stays live for **14 days** and may be pulled before it
publishes. Two live submissions saying the same thing about the same asset make
her louder, but never change the rating.

*Rule: RB 7.9(c).*

---

# PART 8 — WATCHING THE LEAGUE

## HT 8.1 League

> **Answers:** What is the score? Who is winning?

**Fig. 6.** Menu → **League**. This week's scores and the standings table, at a
glance. The week tabs and the full table live on the Scoreboard and Standings
pages, which are linked from here.

Scores move until the week is final, and **the brighter side of each row is only
whoever was ahead at the last sync** — not a result.

![League](../League%20Images/How-To/EDFL_HowTo_06_League.jpg)

## HT 8.2 Scoreboard

> **Answers:** Where are the full scores? How do I refresh the scores? Who
> scores the games?

**Fig. 8.** Every matchup, week by week, with the margin and a link to each
Matchup page. A week picker at the foot.

**The scores keep themselves current.** The league syncs every few minutes while
games are being played, with nobody pressing anything. **From Week 3 of 2026 the
league scores every stat line itself**, under the Rule Book's scoring table:
Sleeper supplies the statistics, not the points. Weeks 1 and 2 were scored from
Sleeper's own points and stand as played (HT 9.3).

**The REFRESH FROM SLEEPER button does nothing for the current week at present.**
It still calls the scoring used for Weeks 1 and 2, which skips every later week.
That is a known defect, and the scheduled sync keeps the scores current
regardless.

**Records on Standings do not move until a week's last game is four hours past.**
That is why the Scoreboard can show a game in progress while the Standings still
show last week's record. See HT 8.3.

![Scoreboard](../League%20Images/How-To/EDFL_HowTo_08_Scoreboard.jpg)

## HT 8.3 Standings

> **Answers:** Why does the table not show this week? How are standings ranked?

**Fig. 7.** Ranked on overall record, then points for. **Divisions are shown as a
label and carry no seeding weight here.**

**A week counts only once it is final** — four hours after its last kickoff, with
the scores taken in since. A banner says which week is still being played and
when it will post. That is why a Sunday afternoon does not show every team with a
game played.

**This table is a ranking, not a seeding.** The full tie-breakers and the playoff
seeding rules are applied when the playoffs are seeded, not by this page.

*Rules: RB 9.1, RB 8.1(c).*

![Standings](../League%20Images/How-To/EDFL_HowTo_07_Standings.jpg)

## HT 8.4 The Matchup page

> **Answers:** Who is counting in my lineup? What is that projection? Why is it
> lower than Sleeper's?

**Fig. 9.** Both sides of a pairing: the twelve best-ball slots, the bench, the
live score, and a projection.

**The large number is the official best-ball score.** The smaller *proj* figure
is an estimate for players who have not kicked off yet. **Nothing in the league is
ever settled from it.**

**Best ball picks your twelve slots for you, and picks them again every time
somebody scores.** What you see is the lineup as it stands right now — a player
who has not kicked off is holding his slot on his projection and will lose it if
the man behind him outscores it.

**Why the projection is not Sleeper's, and this is deliberate.** Rotowire does not
project first downs, and EDFL pays a point for each one. Sleeper fills that gap
with a yards-derived figure, which overstates — most of all at quarterback, by
roughly 16 points. This app estimates first downs from projected volume instead,
at rates measured across every game in the league's own stats table. Week 1's
real results decided between the two approaches and estimation won at every
position.

The page says all of this in two paragraphs above the starters. **A missing
projection is shown as missing, never as 0.00.**

![The Matchup page](../League%20Images/How-To/EDFL_HowTo_09_Matchup.jpg)

## HT 8.5 Cap Sheet

> **Answers:** Where can I see every team's cap? Who has room?

**Fig. 11.** Every team's cap standing in one table: status, cap used, cap space,
minimum spend, cash spent, cash remaining, and a bar for cap room.

The **STATUS** column is the same compliance test as the banner on a team page
(HT 2.2), composed by the same view — the two cannot disagree.

Click any team name to open its Team HQ.

![Cap Sheet](../League%20Images/How-To/EDFL_HowTo_11_Cap_Sheet.jpg)

## HT 8.6 Transactions

> **Answers:** What has happened in the league? How do I find a move?

**Fig. 19.** Every roster move in the league — signings, releases, trades,
practice squad and IR moves, restructures and option decisions. Auction bidding
lives on the tier results pages instead.

Filter by kind (the counts are shown on each chip), by player or team, by date
range, and sort newest or oldest first.

![Transactions](../League%20Images/How-To/EDFL_HowTo_19_Transactions.jpg)

## HT 8.7 Draft Picks

> **Answers:** Who owns which pick? Where did this pick come from?

**Fig. 20.** Every pick the league has or will have, by season — 2023 through
2029. For each: who owned it originally, who owns it now, who was taken with it,
and **the full chain of what has happened since**.

Reference only. Nothing is traded from this page.

![Draft Picks](../League%20Images/How-To/EDFL_HowTo_20_Draft_Picks.jpg)

## HT 8.8 Injury Report

> **Answers:** Who is hurt? Is this designation current?

**Fig. 21.** Every EDFL player carrying an NFL injury designation, plus anyone who
cleared one in the last seven days.

The banner names **when the last pull ran** — it is a daily automatic pull at
17:00 ET, so this is the last pull and not live data.

**Status sorts by severity**, IR and PUP first and Questionable last, not
alphabetically. Filter by rostered or all, by position, by EDFL team, or by name.
Download as CSV, Excel or PDF.

**A designation here has no effect on the cap, on roster counts, or on whether a
move is legal** — except that four of them (IR, Out, Doubtful, PUP) are what let
a player hold an injured reserve place (HT 5.2).

![Injury Report](../League%20Images/How-To/EDFL_HowTo_21_Injury_Report.jpg)

## HT 8.9 League Finances

> **Answers:** Who has been fined? What is in the League Fund?

**Fig. 22.** Every team's fines, itemised, visible to **every** signed-in owner —
not own-team-only. The League Fund total for the season sits at the top.

Read-only. **Fines are posted by the system, never from a form.** A fine also
appears on the fined team's own cash account.

![League Finances](../League%20Images/How-To/EDFL_HowTo_22_League_Finances.jpg)

## HT 8.10 Draft Prospects

> **Answers:** Who is in next year's rookie class?

**Fig. 23.** ESPN's board as published — grade and rank are theirs, not the
league's — filtered to QB, RB, WR, TE and K, the positions the league plays.
Nothing is derived from it.

It exists so that a draft rumour has a subject (HT 7.6). It fills when ESPN
publishes the next class and the commissioner loads it, and rolls forward when he
closes the league's rookie draft.

![Draft Prospects](../League%20Images/How-To/EDFL_HowTo_23_Draft_Prospects.jpg)

## HT 8.11 The Action Log

> **Answers:** What has the commissioner done? Can I audit an officer action?

**Fig. 24.** Every administrative action an officer takes, newest first, **with
the reason given at the time**. Deletions, cash adjustments, auction decisions,
syncs, proxy access, appointments.

**Every signed-in owner can read it.** Since September 17 the whole app needs a login,
this page included, so a link to it works for owners only. *(The Rule Book says the log is
readable by anyone; that difference is with the commissioner.)*

Each entry has a **What was recorded** expander holding a full snapshot of
whatever was changed or removed — so the record survives the thing it describes.

*Rule: RB 1.11.*

![The Action Log](../League%20Images/How-To/EDFL_HowTo_24_Action_Log.jpg)

## HT 8.12 The League Calendar

> **Answers:** When is the deadline? What dates matter?

**Fig. 10.** Every dated deadline in the Rule Book, March 1 2026 through the end
of February 2027, **each entry citing the rule it comes from**. Game weeks are
read from the same rows the dead-money engine charges against, so the calendar
and the salary clock cannot disagree.

Filter by category — Cap & Cash, Contracts, Cuts, Draft, Gameplay, Governance,
Roster, Season, Trades — or hide past entries.

**The calendar is where dates live. The rule text is what governs if they ever
disagree.** If you spot a mismatch, say so — the calendar entry is the thing to
fix.

![The League Calendar](../League%20Images/How-To/EDFL_HowTo_10_League_Calendar.jpg)

## HT 8.13 The three Discord wires

> **Answers:** What are those bots? Will they ping me?

Three wires post automatically. **None of them is the official record** — the app
and the Action Log are.

| Wire | Channel | Posts |
|---|---|---|
| **Mort_Report** | `#mort-report` | Every transaction, roster moves included, and the losing bidders once a contested free agency window resolves |
| **The League Office** (Robo Goodell) | `#league-office` | Every calendar date at seven days, one day and the hour; every fine with the team, the amount, the reason and when and why it was incurred; the commissioner's memos; and a public compliance callout for a team whose owner chose one (HT 2.10) |
| **Dianna** | `#insider-threat` | What owners tell her (HT 7.6), and every poach window as it opens — never naming who opened it |

**No wire mentions anyone.** Only two things you do can make a wire speak:
opening a poach window, which Dianna announces without naming you; and switching
on the public callout, which lets the League Office name your team while it is
out of compliance. **Private warnings are not on any wire** — they go by email or
Discord direct message, as you choose on Owner Settings (HT 2.10).

A League Office memo always goes **to the channel**, never privately to one
owner.

*Rule: RB 1.10(c).*

## HT 8.14 The League Library

> **Answers:** Where is the Rule Book? Can I read the manuals in the app? How do I
> leave feedback on a rule?

Menu → **Rule Book & Manuals** (`/library`). The three governing documents — the
**Rule Book**, the **Technical Manual** and **this manual** — each readable in the
app, with a contents list, a link to every section, and the version and date
taken from the document itself. Every signed-in owner may read all three. The
Rule Book downloads as Word or Markdown; the manuals as Markdown.

Each Technical Manual section links to the Rule Book clause it enforces.

**Feedback.** At the foot of each document you may leave feedback on the **whole
document** or on **this section**. **Feedback is visible to every owner, with your
team on it** — it is not sealed. You may withdraw your own while it is open. The
commissioner or co-commissioner may reply, resolve or reopen it, and a reply is
signed **League office**. Nothing is deleted.

*Rule: none — this is where the rules are read.*

## HT 8.15 The Data Center and Claude

> **Answers:** Can I download league data? Can I get it into Excel? How do I
> connect Claude to the league? Is my connector link private?

Menu → **Data Center** (`/data`). Three sections.

**Briefing pack.** One Markdown file with the standings, every team's cap and
cash, every roster, draft picks, the Player Value Chart, the top free agents and
recent transactions. Drop it into a Claude chat or project and ask questions.

**Downloads.** Twenty league-wide datasets — rosters, cap and cash by team and
season, draft picks, contracts, cuts and dead money, free agents, the Player Value
Chart, the injury report, the official weekly scores, statistics, standings,
results, transactions, trades, fines, auction bids, and resolved free agency and
poach offers — each as **CSV**, **Excel** or **Markdown written for Claude**.
Figures are to the cent, not rounded to the dollar as they are on screen.

**Everything here is what every owner can already see in the app, and nothing
sealed is included.** A dataset is the same for every owner — your own team gets
no extra rows. An offer appears only once its window has resolved, a trade only
once it is public.

**Connect Claude.** **Create connector link** makes a personal link that lets
Claude read the league directly. It is **read-only**: it can change nothing.

1. **Copy the link straight away.** It is shown once and never again.
2. In Claude on the web or the desktop app, open **Customize → Connectors**, then
   **+ Add → Add custom connector**. Name it **EDFL**, paste the link as the URL,
   choose **No sign in** for authentication, and click **Add**.
3. In a chat, turn EDFL on from the tools menu and ask — *"Which teams have the
   most cap room in 2027?"* Once added on the web it is in the Claude phone app
   too.
4. Claude Code instead: `claude mcp add --transport http edfl <your link>`

**Treat a link like a password**: anyone holding it can read what any owner can
read. You may hold **three live links**. Revoke one under **Your connector links**
and any Claude using it loses access on its next request. The commissioner and
co-commissioner can see and revoke every link in the league.

*Rule: none — this is app access, not a rule of play.*

## HT 8.16 Statistics

> **Answers:** Where are player stats? How many fantasy points did he score last
> season? Why does a stat line differ from the matchup score?

Menu → **Statistics** (`/stats`). Real NFL game data, regular seasons from 2021 to
the current one, scored under the league's scoring table. Click a column header to
sort, or a player for his full history. Total combines every season.

**The season in progress refreshes every morning** and covers every player,
rostered or not.

**Two 2026 numbers exist, and they are not the same number.** The **official
weekly score** — on the Scoreboard, the Matchup page and the Standings — is the
one that counts. The figures on Statistics come from a separate feed and **can
differ slightly after an NFL stat correction**. Nothing is settled from them.

*Rule: RB 8.5.*

---

# PART 9 — WHEN SOMETHING GOES WRONG

## HT 9.1 A move was refused

> **Answers:** The app won't let me do this. What does this error mean?

**Read the refusal. It names the rule, the figure and the limit**, because the
rule itself composes the sentence. It is not a generic error message.

The commonest refusals and what they mean:

| Refusal | What to do |
|---|---|
| *No open active place* | Make room first — cut, trade, or send someone down. A player already on the wire no longer fills a place. |
| *Practice squad contracts cannot be restructured* | Correct. That is RB 5.16. |
| *A rookie contract cannot be restructured until after the completion of the player's third season* | Correct. The message names the year it becomes eligible. |
| *This player is locked onto the active roster* | He hit three weeks and was promoted again. The only route back is cut → clear waivers → new practice squad contract (HT 5.3). |
| *This player is under an open poach window* | He is frozen until it resolves. Nothing can move him, including you. |
| *A bid must carry strictly higher total PPV than the offer it replaces* | You may only revise upward (HT 6.1). |
| *Offer cannot be withdrawn* | Correct, and deliberate. There is no Withdraw button. |
| *Over the salary cap* | The cap is a hard limit in season. No transaction may cross it. |
| *Team has negative Owner Cash* | A team with negative cash can make no transaction that costs money. Clear the fine first. |

**If the refusal names a rule you think is wrong**, that is a question for the
commissioner, not a bug report. The app is enforcing what the Rule Book says.

## HT 9.2 The app and Sleeper disagree

> **Answers:** Sleeper shows a different roster. Which one is right?

**The app is right.** It is the system of record for contracts, the cap, Owner
Cash, roster status, every transaction and, from Week 3 of 2026, the score.
Sleeper carries lineups and supplies statistics, positions and injury
designations, and the commissioner keeps its rosters in step by hand.

So a disagreement means Sleeper has not been updated yet, not that the app is
wrong. Say so in Discord and it gets synced.

**What Sleeper still decides:** which position a player is eligible to fill, and
his injury designation. **It no longer decides the score** — the app scores every
stat line itself (HT 8.2). Automatic IR moves (HT 2.10) are made in the app only,
so Sleeper will lag those too until they are mirrored.

**Setting a lineup in Sleeper does nothing here.** Best ball is computed from your
whole active roster in this app (HT 3.2).

*Rule: RB 1.13(b).*

## HT 9.3 A score looks wrong

> **Answers:** My score is wrong. A player who should have counted didn't.

Work through it in this order:

1. **Was he on your active roster at the time?** Practice squad and injured
   reserve players score **nothing**, however they perform. Best ball counts the
   active roster only.
2. **Is the week final?** Scores move until four hours after a week's last
   kickoff. The Standings do not count a week until then.
3. **Wait for the next sync.** The scores update themselves every few minutes
   during games. The refresh button on the Scoreboard does not currently help
   (HT 8.2).
4. **Check the Matchup page** (HT 8.4). It shows which twelve players are
   actually counting, one row per slot — best ball may be picking someone you did
   not expect.
5. **Remember the projection is not the score.** The small *proj* figure settles
   nothing.
6. **Was he over a roster limit?** A player added after the compliance moment who
   takes you over 25 active, three quarterbacks or three kickers scores zero (HT
   3.4). The red strip names him.

**Three things that are known and not errors:**

- **Weeks 1 and 2 of 2026 stand as played.** They were scored from Sleeper's own
  points, which paid six for a rushing touchdown where the Rule Book pays five. By
  ruling, no result is restated.
- **A pick six thrown** scores nothing for now; it has no column yet.
- **A missed field goal under 40 yards** costs nothing until the commissioner sets
  its rate. A miss of 40 yards or more correctly costs nothing.

If it is still wrong after all that, raise it in Discord with the week and the
player.

## HT 9.4 Asking for a ruling

> **Answers:** Who do I ask? What if I think a rule is unfair? How does a
> grievance work?

**A question about how to do something** — ask in Discord, or find the section
here.

**A question about what a rule means** — the Rule Book. Cite the clause number;
the league runs on them.

**A situation the rules do not cover** — that is a grievance. Bring it to the
commissioner, who decides it within 24 hours where he can. If it remains after
his decision, anyone may propose a solution and all owners vote; a majority
carries, with a run-off between the top two if nothing takes a majority.

**The grievance process is for a situation the rules do not cover.** It is not an
appeal against a rule that does cover it.

**One thing you cannot grieve:** acting on something published on the rumour
wire. A submission does not have to be true, and everyone is told so in advance.

*Rules: RB 1.3, RB 7.9(c)(iii).*

---

# PART 10 — OFFICERS ONLY

*Nothing in this part is reachable by an ordinary owner. It is here so the powers
are visible and auditable rather than folklore.*

## HT 10.1 The Commissioner Portal

> **Answers:** Where are the admin tools? What needs my attention?

**Fig. 26.** The **COMMISH** pill in the app bar is the only door to `/admin`. It
carries a count.

At the top of the portal, the **officer action banner** lists what needs a
commissioner or co-commissioner — a Sleeper roster mismatch still on the
worklist, say, with how long it has been there. It recomputes every time the page
loads and every fifteen minutes in the background.

**A failed read renders an error, never "All clear."** Those are different facts.

Below it the tools are grouped — This Week (the syncs), Roster & Contracts, and
the rest.

**Every page here is gated twice**: the page redirects a non-officer, and every
action re-checks independently. Most are open to both officers; a few are the
commissioner's alone (HT 10.6, the Player Value Chart tools, granting officer
status, and the competitive-balance veto).

![The Commissioner Portal](../League%20Images/How-To/EDFL_HowTo_26_Commissioner_Portal.jpg)

## HT 10.2 Resolving a free agency or poach window

> **Answers:** How do I resolve a window? Why didn't it resolve itself?

**Windows settle themselves.** Since October 4, 2026 each closed window is settled
within a minute by the same engine the Resolve button runs, with no officer named.
**Preview** and **Resolve** remain as the fallback, for a window the automatic
settle could not complete — it stays open and marked. **The signing week is the
week the window closed**, whoever settles it and however late.

1. Go to **Free Agency** or **Poaching**. A closed, unresolved window is marked.
2. **Preview** it. The preview runs the real award engine and rolls it back, so
   what you see is what will happen. It refuses before the window has closed —
   until then the ranking *is* the sealed offers.
3. **Resolve.** Highest PPV wins at its exact terms; ties to the earliest offer,
   or to the incumbent on a poach.
4. The gates apply in order — cash, cap, then roster ceilings. A failing bid is
   passed over and the next is tested the same way.
5. **Mirror the result in Sleeper.**

## HT 10.3 The syncs

> **Answers:** How do I sync rosters? When does the injury pull run?

Four tools under **This Week**:

| Tool | What it does |
|---|---|
| **Sleeper Sync** | Pulls rosters and adjudicates conflicts against the app's record |
| **Injury Sync** | Pulls injury designations. Also runs automatically at 17:00 ET daily |
| **Import Stats & Publish Results** | NFL statistics by season; the season in progress also imports itself every morning. Publishing EDFL season results is for a **completed** season only — it refuses the current one — and refuses an overwrite unless republish is passed, a separate two-step control |
| **Sync Players** | Refreshes the player list from Sleeper |

**Sync Players and Import Stats write through the service-role client**, so their
own checks are the whole gate. Treat them with more care than the others.

## HT 10.4 Acting for another team

> **Answers:** How do I cut from another roster? How do I edit an owner's card?

**Cuts & Roster Moves** cuts from any roster, with all normal cap and cash
consequences, and holds the cut ledger. Before the first game of the regular
season it is how a roster still out of compliance at the start of the In-Season
is brought into line — most recently signed or drafted first (RB 3.6(a)). **In
season no officer does this any more** (RB 3.6(b)(i), repealed October 4, 2026):
the owner cures his own roster and the fines run until he does (HT 3.4).

**Restructure (any team)** acts for an owner.

**Owner Administration** is where officer editing of another owner's card lives —
the only place it does. The appointment control there is **commissioner-only**.

Every one of these writes to the Action Log with your stated reason.

## HT 10.5 Cash adjustments

> **Answers:** How do I credit or debit a team's Owner Cash?

**Cash** on the portal. Each adjustment is an individual ledger transaction with
a note explaining it, and each is automatically written to the Action Log.

**Available cash is computed, never set.** You are adding a transaction, not
overwriting a balance.

## HT 10.6 The Calendar Loader

> **Answers:** How do I change a date? Who can edit the calendar?

`/admin/calendar`. **Commissioner only** — the page, its actions and every
underlying function.

It edits league weeks and calendar entries. Remember the discipline: the
**calendar** is the authoritative home for *when*; the **rule** is the
authoritative home for *what*. If they disagree, the calendar entry is the defect.

Changing a week's instants changes when salary is charged, when the wire opens
and runs, and when compliance is measured. Do it carefully.

## HT 10.7 The League Office memo desk

> **Answers:** How do I send a league-wide notice? Can I take one back?

`/admin/league-office`. Open to both officers.

Write the memo — **1,800 characters maximum**, because the wire adds its own
opening and closing lines and Discord's limit is 2,000 — and pick a delay:

- **now**
- **tonight** — 20:00 ET, rolling to 09:00 tomorrow if it is already past eight
- **tomorrow** — 09:00 ET

**A memo goes to the channel, never privately to one owner.**

**Withdrawal is real but it expires.** You can pull a memo until it has actually
been said; after that the answer is *"Too late. He already said it. Discord has
no take-backs from here."* The window is exactly as long as the next five-minute
sweep.

The same page has the **mute switches** for each wire kind.

## HT 10.8 The prospect board

> **Answers:** How do I load next year's prospects?

`/admin/prospects`. Refresh the board from ESPN, match prospects to their Sleeper
records, match by hand where the automatic match fails, and close the rookie
draft to roll the board to the next class.

There is no scheduled job behind this; it runs when you run it.

---

# APPENDIX — FIGURE INDEX

All figures captured from the live app on **September 20, 2026**, at 1,440px
width in the dark theme. They live in `EDFL\League Images\How-To`.

| Fig. | File | Section |
|---|---|---|
| 1 | `EDFL_HowTo_01_TeamHQ_Overview.jpg` | HT 2.1, 2.3 |
| 2 | `EDFL_HowTo_02_TeamHQ_Roster.jpg` | HT 2.4 |
| 3 | `EDFL_HowTo_03_TeamHQ_Money.jpg` | HT 2.5 |
| 4 | `EDFL_HowTo_04_TeamHQ_Media.jpg` | HT 2.6, 7.6 |
| 5 | `EDFL_HowTo_05_Navigation_Drawer.jpg` | HT 1.3 |
| 6 | `EDFL_HowTo_06_League.jpg` | HT 8.1 |
| 7 | `EDFL_HowTo_07_Standings.jpg` | HT 8.3 |
| 8 | `EDFL_HowTo_08_Scoreboard.jpg` | HT 8.2 |
| 9 | `EDFL_HowTo_09_Matchup.jpg` | HT 8.4 |
| 10 | `EDFL_HowTo_10_League_Calendar.jpg` | HT 8.12 |
| 11 | `EDFL_HowTo_11_Cap_Sheet.jpg` | HT 8.5 |
| 12 | `EDFL_HowTo_12_Player_Card.jpg` | HT 4.1 |
| 13 | `EDFL_HowTo_13_Free_Agency.jpg` | HT 6.1 |
| 14 | `EDFL_HowTo_14_Waiver_Wire.jpg` | HT 6.2 |
| 15 | `EDFL_HowTo_15_Poaching.jpg` | HT 6.3 |
| 16 | `EDFL_HowTo_16_Trades.jpg` | HT 7.1, 7.2 |
| 17 | `EDFL_HowTo_17_Propose_a_Trade.jpg` | HT 7.1 |
| 18 | `EDFL_HowTo_18_Restructure.jpg` | HT 4.3 |
| 19 | `EDFL_HowTo_19_Transactions.jpg` | HT 8.6 |
| 20 | `EDFL_HowTo_20_Draft_Picks.jpg` | HT 8.7 |
| 21 | `EDFL_HowTo_21_Injury_Report.jpg` | HT 8.8 |
| 22 | `EDFL_HowTo_22_League_Finances.jpg` | HT 8.9 |
| 23 | `EDFL_HowTo_23_Draft_Prospects.jpg` | HT 8.10 |
| 24 | `EDFL_HowTo_24_Action_Log.jpg` | HT 8.11 |
| 25 | `EDFL_HowTo_25_Install_on_Phone.jpg` | HT 1.4 |
| 26 | `EDFL_HowTo_26_Commissioner_Portal.jpg` | HT 10.1 |

**Not yet captured**, and worth adding on the next pass: the Fifth Year Option
page (HT 4.4), the cut dialog with its Dead and Saved tables (HT 5.4), the
roster-move dialog with a practice squad warning (HT 5.1), the offer form (HT
6.1), the claim form (HT 6.2), the cash account (HT 2.8), a phone-width capture of
Team HQ, and everything added on October 5, 2026: the red compliance strip (HT
2.2), Owner Settings (HT 2.10), the poach strip (HT 6.3), the trade cards by
season (HT 7.1), the League Library (HT 8.14), the Data Center (HT 8.15) and
Statistics (HT 8.16).

**Out of date:** Fig. 5 shows the menu before it was regrouped (HT 1.3 has the
current table); Fig. 8 shows the Scoreboard's refresh button, which no longer
helps (HT 8.2); and Fig. 1 pre-dates the red strip under the app bar.

---

# VERSION RECORD

| Version | Date | What changed |
|---|---|---|
| **1.0** | Sep 20, 2026 | First edition, published alongside Rule Book v2.0 and Technical Manual v23. Absorbs the five standalone decision trees — Cuts, Free Agency, Poaching, Practice Squad and Waivers — which are superseded as separate documents and archived. Every section carries a stable **HT** identifier and an *Answers:* line, so that all three documents can be loaded into one clause table and served by the League Office wire. |
| **1.1** | Sep 21, 2026 | Published alongside Rule Book v2.1 and Technical Manual v24. The practice squad poaching exemption and the 24-hour return grace (HT 6.3), the active-roster hold through the Tuesday return (HT 5.3), the redrawn roster bar (HT 2.3) and the Exempt and Hold controls on the Roster tab (HT 2.4); poaching opens Wednesday September 23 at noon. *This row was omitted from v1.1 itself and is restored here.* |
| **1.2** | Oct 5, 2026 | Published alongside Rule Book v2.2 and Technical Manual v25. **HT 3.4 rewritten** for the fine schedule that applies from Week 5 — a weekly roster fine of \$75, or \$25 if cured before the first kickoff; \$25 per unit still open 24 hours later; \$25 for an IR place held 24 hours without a designation; the newest player over 25 active, three quarterbacks or three kickers scores zero — and no officer cures a roster any more. **New HT 2.10** Owner Settings: the two automatic IR switches and the notices by email, Discord and public callout. The red alert under the app bar (HT 2.2); poach notices and Dianna's announcement (HT 6.3, 8.13); windows settle themselves (HT 6.1, 6.3, 10.2); Dead against Saved in the cut dialog (HT 5.4) and by season on trade cards (HT 7.1); the red cross on every designation (HT 4.1, 5.2); the league scores its own stat lines from Week 3 and the refresh button is a known defect (HT 8.2, 9.2, 9.3). **New HT 8.14** League Library, **8.15** Data Center and the Claude connector, **8.16** Statistics. The menu table matches the regrouped menu (HT 1.3). The phone icon still sends no push notices (HT 1.4). The Action Log needs a login, as the whole app has since September 17 (HT 8.11). |

---

*End of the EDFL Owner How-To Manual, Version 1.2.*
