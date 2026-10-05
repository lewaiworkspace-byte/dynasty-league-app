import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createSupabaseServerClient } from '../../lib/supabaseServerClient';
import { getCurrentTeamOwner, isCommissionerOrCo } from '../../lib/getCurrentTeamOwner';
import { DATASETS, POSITIONS, loadContext, UNITS_NOTE } from '../../lib/dataExports';
import { formatShortDateTime } from '../../lib/formatDate';
import Breadcrumbs from '../../components/Breadcrumbs';
import ConnectorPanel from '../../components/ConnectorPanel';

export const revalidate = 0;
export const metadata = { title: 'Data Center' };

/**
 * DATA CENTER -- /data. October 5, 2026.
 *
 * Two things an owner asked for in one place: download league data (CSV,
 * Excel, or Markdown written for Claude), and connect Claude to the league
 * through a personal connector link (MCP).
 *
 * THE PAGE READS NO DATASET. Each download is a plain GET form to
 * /data/export/<key>, which loads the dataset on demand -- rendering twenty
 * datasets to draw twenty buttons would be twenty full reads per visit.
 * The datasets, their filters and their wording are lib/dataExports.js's.
 *
 * Gate: the middleware, plus this page's own redirect (belt and braces).
 * Any logged-in owner. The officers' list of every key in the league is
 * drawn for an officer only, and officer_api_keys() refuses anyone else
 * itself -- the check here decides what is DRAWN, not what is permitted.
 */

function seasonOptions(ctx) {
  const out = [];
  for (let y = ctx.season + 5; y >= 2021; y--) out.push(y);
  return out;
}

function DatasetCard({ ds, ctx }) {
  const seasons = seasonOptions(ctx);
  const defSeason = ds.defaultSeason ? ds.defaultSeason(ctx) : '';
  return (
    <div className="dc-card" id={'ds-' + ds.key}>
      <div className="dc-card-title">{ds.title}</div>
      <p className="dc-card-about">{ds.about}</p>
      <form method="get" action={'/data/export/' + ds.key} className="dc-form">
        {ds.filters.length ? (
          <div className="dc-filters">
            {ds.filters.indexOf('season') !== -1 ? (
              <label className="dc-filter">
                <span>Season</span>
                <select name="season" className="ntf-input" defaultValue={String(defSeason)}>
                  {ds.requiresSeason ? null : <option value="">All seasons</option>}
                  {seasons.map(function (y) {
                    return (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
            {ds.filters.indexOf('team') !== -1 ? (
              <label className="dc-filter">
                <span>Team</span>
                <select name="team" className="ntf-input" defaultValue="">
                  <option value="">All teams</option>
                  {ctx.teams.map(function (t) {
                    return (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
            {ds.filters.indexOf('position') !== -1 ? (
              <label className="dc-filter">
                <span>Position</span>
                <select name="position" className="ntf-input" defaultValue="">
                  <option value="">All</option>
                  {POSITIONS.map(function (p) {
                    return (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="dc-row">
          <button type="submit" name="format" value="csv" className="btn btn-secondary dc-small">
            CSV
          </button>
          <button type="submit" name="format" value="xlsx" className="btn btn-secondary dc-small">
            Excel
          </button>
          <button type="submit" name="format" value="md" className="btn btn-secondary dc-small">
            Claude (.md)
          </button>
        </div>
      </form>
    </div>
  );
}

export default async function DataCenterPage() {
  const me = await getCurrentTeamOwner();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=' + encodeURIComponent('/data'));

  let ctx = null;
  let ctxError = null;
  try {
    ctx = await loadContext(supabase);
  } catch (e) {
    ctxError = e && e.message ? e.message : String(e);
  }

  const officer = isCommissionerOrCo(me);
  const [keysRes, officerRes] = await Promise.all([
    me ? supabase.rpc('my_api_keys') : Promise.resolve({ data: [], error: null }),
    officer ? supabase.rpc('officer_api_keys') : Promise.resolve(null),
  ]);

  function labelled(rows) {
    return (rows || []).map(function (k) {
      return Object.assign({}, k, {
        createdLabel: formatShortDateTime(k.created_at),
        lastUsedLabel: k.last_used_at ? formatShortDateTime(k.last_used_at) : null,
      });
    });
  }

  const h = headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'dynasty-league-app-gold.vercel.app';
  const proto = h.get('x-forwarded-proto') || (host.indexOf('localhost') === 0 ? 'http' : 'https');
  const baseUrl = proto + '://' + host;

  const groups = [];
  DATASETS.forEach(function (d) {
    let g = groups.find(function (x) {
      return x.title === d.group;
    });
    if (!g) {
      g = { title: d.group, items: [] };
      groups.push(g);
    }
    g.items.push(d);
  });

  return (
    <main className="page set-page dc-page">
      <Breadcrumbs trail={[{ label: 'Data Center' }]} />
      <div className="eyebrow">League</div>
      <h1>Data Center</h1>
      <p className="subhead">
        Download league data as CSV, Excel or a Markdown file written for Claude -- or connect Claude to
        the league directly.
      </p>

      <nav className="set-nav" aria-label="Data Center sections">
        <a href="#briefing">Briefing pack</a>
        <a href="#downloads">Downloads</a>
        <a href="#claude">Connect Claude</a>
      </nav>

      <section id="briefing" className="set-section">
        <h2 className="section-heading">Briefing pack</h2>
        <p>
          One Markdown file with the standings, every team&apos;s cap and cash, every roster, draft
          picks, the Player Value Chart, the top free agents and recent transactions. Drop it into a
          Claude chat or project and ask questions.
        </p>
        <a className="btn" href="/data/export/briefing?format=md">
          Download briefing (.md)
        </a>
      </section>

      <section id="downloads" className="set-section">
        <h2 className="section-heading">Downloads</h2>
        <p className="ntf-fine">
          {UNITS_NOTE} Figures are to the cent, not rounded to the dollar as they are on screen. Everything here is what every owner can see in
          the app; nothing sealed is included.
        </p>
        {ctxError ? (
          <p className="ntf-error">The league could not be read, so downloads are unavailable: {ctxError}</p>
        ) : (
          groups.map(function (g) {
            return (
              <div key={g.title} className="dc-group">
                <h3 className="set-h3">{g.title}</h3>
                <div className="dc-cards">
                  {g.items.map(function (d) {
                    return <DatasetCard key={d.key} ds={d} ctx={ctx} />;
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      <section id="claude" className="set-section">
        <h2 className="section-heading">Connect Claude</h2>
        {me ? (
          <ConnectorPanel
            keys={labelled(keysRes.data)}
            baseUrl={baseUrl}
            loadError={keysRes.error ? keysRes.error.message : null}
            officerKeys={officerRes && !officerRes.error ? labelled(officerRes.data) : null}
            officerError={officerRes && officerRes.error ? officerRes.error.message : null}
          />
        ) : (
          <p>Your login is not linked to a team, so it cannot hold a connector link.</p>
        )}
      </section>
    </main>
  );
}
