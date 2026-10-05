import { adminClient } from '../../../../lib/supabaseAdmin';
import { loadContext } from '../../../../lib/dataExports';
import { TOOLS, SERVER_INFO, INSTRUCTIONS, callTool } from '../../../../lib/dataMcp';

/**
 * THE CLAUDE CONNECTOR -- a remote MCP server (Streamable HTTP, stateless,
 * JSON responses). October 5, 2026.
 *
 *   POST /api/mcp/<key>                      key in the URL (claude.ai custom
 *                                            connectors: "No sign in")
 *   POST /api/mcp  + Authorization: Bearer <key>   (Claude Code, Desktop config)
 *
 * WHY THIS ROUTE IS ALLOWLISTED IN middleware.js. Claude's servers call it
 * with no cookie, so behind the front door it would answer 307 to /login and
 * the connector would never connect. Like /api/cron, it does its own gate:
 * every request -- initialize, tools/list, tools/call -- must carry a live
 * key, resolved by api_key_resolve(), which is service_role ONLY and stamps
 * last_used_at. No key, a revoked key, or a key whose owner row is gone: 401,
 * and nothing is read.
 *
 * WHY THE SERVICE-ROLE CLIENT. There is no Supabase session behind a key, so
 * auth.uid() is NULL and authenticated-only views would read as empty. The
 * service-role client is therefore the only way to read, and that is safe
 * ONLY because every read goes through lib/dataExports.js, whose datasets are
 * league-wide by construction and which applies the "everyone" branch of each
 * sealed table's policy as an explicit filter. DO NOT add a read to this file
 * or to lib/dataMcp.js that bypasses lib/dataExports.js, and do not call any
 * function that gates on auth.uid() from here -- through this client it would
 * refuse or mis-attribute (CLAUDE.md, the database boundary).
 *
 * WRITES: none. Every tool is read-only and declares readOnlyHint.
 *
 * STATELESS: no Mcp-Session-Id is issued, nothing is kept between requests,
 * and GET (the optional server-to-client SSE stream) answers 405, which the
 * spec allows. Responses are application/json, which a Streamable HTTP client
 * must accept.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function json(body, status, extra) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign(
      { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      extra || {}
    ),
  });
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code: code, message: message } };
}

function keyFrom(request, params) {
  const seg = params && Array.isArray(params.key) ? params.key : [];
  if (seg.length === 1 && seg[0]) return String(seg[0]);
  const auth = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim());
  return m ? m[1] : null;
}

async function resolveKey(client, key) {
  if (!key || !/^edfl_[0-9a-f]{48}$/.test(key)) return null;
  const { data, error } = await client.rpc('api_key_resolve', { p_key: key });
  if (error) throw new Error(error.message);
  return data && data.length ? data[0] : null;
}

async function handleOne(client, getCtx, msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return rpcError(msg && msg.id, -32600, 'Invalid request.');
  }
  const isNotification = msg.id === undefined || msg.id === null;
  if (isNotification) return null; // notifications/initialized, cancelled, etc.

  const id = msg.id;
  const p = msg.params || {};

  if (msg.method === 'initialize') {
    const asked = p.protocolVersion;
    return {
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: SUPPORTED_VERSIONS.indexOf(asked) !== -1 ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      },
    };
  }
  if (msg.method === 'ping') return { jsonrpc: '2.0', id: id, result: {} };
  if (msg.method === 'tools/list') return { jsonrpc: '2.0', id: id, result: { tools: TOOLS } };
  if (msg.method === 'resources/list') return { jsonrpc: '2.0', id: id, result: { resources: [] } };
  if (msg.method === 'resources/templates/list') return { jsonrpc: '2.0', id: id, result: { resourceTemplates: [] } };
  if (msg.method === 'prompts/list') return { jsonrpc: '2.0', id: id, result: { prompts: [] } };
  if (msg.method === 'tools/call') {
    const name = p.name;
    if (!TOOLS.some(function (t) { return t.name === name; })) {
      return rpcError(id, -32602, 'Unknown tool: ' + name);
    }
    let ctx;
    try {
      ctx = await getCtx();
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: id,
        result: { content: [{ type: 'text', text: 'The league database is unavailable: ' + (e && e.message ? e.message : String(e)) }], isError: true },
      };
    }
    const result = await callTool(client, ctx, name, p.arguments || {});
    return { jsonrpc: '2.0', id: id, result: result };
  }
  return rpcError(id, -32601, 'Method not found: ' + msg.method);
}

export async function POST(request, { params }) {
  const client = adminClient();

  let owner;
  try {
    owner = await resolveKey(client, keyFrom(request, params));
  } catch (e) {
    return json(rpcError(null, -32603, 'Could not check the connector key.'), 500);
  }
  if (!owner) {
    return json(
      { error: 'invalid_key', error_description: 'This EDFL connector key is missing, wrong or revoked. Create a new one on the Data Center page of the league app.' },
      401
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(rpcError(null, -32700, 'Parse error.'), 400);
  }

  let ctxPromise = null;
  const getCtx = function () {
    if (!ctxPromise) ctxPromise = loadContext(client);
    return ctxPromise;
  };

  if (Array.isArray(body)) {
    if (!body.length) return json(rpcError(null, -32600, 'Empty batch.'), 400);
    const out = [];
    for (let i = 0; i < body.length; i++) {
      const r = await handleOne(client, getCtx, body[i]);
      if (r) out.push(r);
    }
    return out.length ? json(out, 200) : new Response(null, { status: 202 });
  }

  const r = await handleOne(client, getCtx, body);
  return r ? json(r, 200) : new Response(null, { status: 202 });
}

export async function GET() {
  return new Response('This is the EDFL Data connector. Add it to Claude as a custom connector; it speaks MCP over POST.\n', {
    status: 405,
    headers: { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
