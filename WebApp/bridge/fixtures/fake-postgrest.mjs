// A fake PostgREST over in-memory tables for the store tests — no network. It answers what the stores ask: eq.
// and is.null / not.is.null filters on the table's own columns (other operators are ignored), the two embeds they read (container_versions(...) under a container,
// information_containers(...) under a version), GET / PATCH / DELETE / POST, and Prefer: return=representation.
// `refuse` names the tables whose PATCH and DELETE the database turns down the way RLS does: no error and no row —
// the answer a store must read as a refusal (H0 D5). audit_log rows get an id and a hash, as the chain trigger would.
export function fakePostgrest(db, { refuse = [] } = {}) {
  const calls = [];
  let nextId = 900;
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : null;
    const prefer = init.headers?.Prefer || "";
    calls.push({ table, method, prefer, body, search: u.search });
    const rows = (db[table] ||= []);
    const eqs = [...u.searchParams].filter(([, v]) => v.startsWith("eq."));
    // Postgres uuid equality (used for every id column here) ignores case — match that so a test can pin the
    // same case-fold behaviour the real database gives (H0 minor N28).
    const nulls = [...u.searchParams].filter(([k, v]) => !k.includes(".") && (v === "is.null" || v === "not.is.null"));
    const hit = (r) => eqs.every(([k, v]) => String(r[k]).toLowerCase() === v.slice(3).toLowerCase())
      && nulls.every(([k, v]) => (v === "is.null") === (r[k] == null));
    const json = (b, status = 200) => new Response(JSON.stringify(b), { status });
    // Without return=representation PostgREST answers a write with no body: 201 for an insert, 204 for the rest.
    const back = (list, status) => (/return=representation/.test(prefer) ? json(list, status) : new Response(null, { status: status === 201 ? 201 : 204 }));
    if (method === "GET") {
      const select = u.searchParams.get("select") || "";
      return json(rows.filter(hit).map((r) => ({
        ...r,
        ...(select.includes("container_versions(") ? { container_versions: (db.container_versions || []).filter((v) => v.container_id === r.id) } : {}),
        ...(select.includes("information_containers(") ? { information_containers: (db.information_containers || []).find((c) => c.id === r.container_id) ?? null } : {}),
      })));
    }
    if (method === "PATCH" || method === "DELETE") {
      const touched = refuse.includes(table) ? [] : rows.filter(hit);
      if (method === "PATCH") for (const r of touched) Object.assign(r, body);
      else db[table] = rows.filter((r) => !touched.includes(r));
      return back(touched.map((r) => ({ ...r })), 200);
    }
    const made = (Array.isArray(body) ? body : [body]).map((b) => (table === "audit_log"
      ? { id: ++nextId, hash: String(nextId).padStart(64, "0"), ...b }
      : { id: crypto.randomUUID(), ...b }));
    rows.push(...made);
    return back(made, 201);
  };
  return { fetch, calls };
}
