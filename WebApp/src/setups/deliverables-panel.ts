// MIDP/TIDP deliverables — the project's delivery plan against what actually arrived.
// Status is DERIVED by the bridge on every read (never stored), so this panel never ticks anything:
// it renders what the CDE actually shows. Plain-DOM, iframe-safe, in the idiom of files-panel.ts.
import * as OBC from "@thatopen/components";
import { SERVICE_URL } from "../config";
import { bfetch } from "./bridge-fetch";
import { currentUser } from "./auth";
import { activePid, onActiveProjectChange } from "./active-project";

type Evidence = { revision: "met" | "mismatch" | "pending" | "not_specified"; suitability: "met" | "mismatch" | "pending" | "not_specified"; actual_revisions: string[]; actual_suitabilities: string[] };
type Exception = { container_name: string; due_date: string | null; responsible_team: string | null; kind: string; severity: "high" | "medium" | "low"; problem: string; evidence: string };
type Row = {
  id: string; container_name: string; title: string | null; responsible_team: string | null;
  due_date: string | null; stage: string | null; notes: string | null;
  status: "delivered" | "late" | "in_wip" | "overdue" | "pending" | "unscheduled";
  first_arrived_at: string | null; published_at: string | null; days_late: number;
  expected_revision: string | null; expected_suitability: string | null; purpose: string | null; evidence: Evidence;
};
type StatusReport = { generated_at: string; today: string; rows: Row[]; summary: Record<string, number>; exceptions: Exception[] };
type Team = { id: string; code: string; name: string | null; lead_email: string | null; discipline: string | null; appointment: string | null; notes: string | null };
type Tidp = { code: string; name: string | null; lead_email: string | null; discipline: string | null; appointment: string | null; declared: boolean; rows: Row[]; summary: Record<string, number>; next_due: string | null; at_risk: number };
type TidpReport = { generated_at: string; today: string; tidps: Tidp[]; unassigned: { rows: Row[]; summary: Record<string, number> }; midp: Record<string, number> & { empty_tidps: string[] } };

const STATUS_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  delivered:   { color: "#22c55e", icon: "✓", label: "delivered" },
  late:        { color: "#f87171", icon: "!", label: "late" },
  in_wip:      { color: "#eab308", icon: "◐", label: "in WIP" },
  overdue:     { color: "#f87171", icon: "✗", label: "overdue" },
  pending:     { color: "#9ca3af", icon: "·", label: "pending" },
  unscheduled: { color: "#71717a", icon: "—", label: "no date" },
};

export function deliverablesPanel(_components: OBC.Components, opts: { baseUrl?: string } = {}): HTMLElement {
  const base = (opts.baseUrl || SERVICE_URL).replace(/\/$/, "");
  const pid = () => activePid();
  const actor = async () => { try { return (await currentUser())?.email || "web"; } catch { return "web"; } };
  const api = async (path: string, init: RequestInit = {}) => {
    const r = await bfetch(`${base}/deliverables${path}`, { headers: { "Content-Type": "application/json" }, ...init });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error((j as { message?: string }).message || `HTTP ${r.status}`), { status: r.status });
    return j;
  };
  let myRole: string | null = "service";
  const canEdit = () => myRole === "service" || ["owner", "lead", "contributor"].includes(myRole ?? "");

  const root = document.createElement("div");
  root.style.cssText = "display:flex;flex-direction:column;height:100%;min-height:0;background:#16161a;color:#c9cfda;font:12px system-ui";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.5rem .6rem;border-bottom:1px solid #2a2a30;flex:0 0 auto";
  const body = document.createElement("div");
  body.style.cssText = "flex:1;min-height:0;overflow:auto;padding:.6rem";
  root.append(bar, body);

  const btn = (label: string, primary = false) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = `border:1px solid #2c2c34;background:${primary ? "#2563eb" : "#1f1f27"};color:${primary ? "#fff" : "#c9cfda"};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`;
    return b;
  };
  const msg = (text: string, isErr = false) => {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `padding:.4rem .6rem;border-radius:.35rem;margin:.4rem 0;background:${isErr ? "#3b1113" : "#132038"};color:${isErr ? "#fca5a5" : "#93c5fd"}`;
    body.prepend(d);
    setTimeout(() => d.remove(), 6000);
  };
  /** A failed read stays on screen as "… not read — why" — a vanished toast over an empty body would read as an empty plan. */
  const notRead = (text: string) => { body.replaceChildren(Object.assign(document.createElement("div"), { textContent: text, style: "color:#fca5a5;padding:1rem" })); };
  const field = (placeholder: string, width = "9rem", value = "") => {
    const i = document.createElement("input");
    i.placeholder = placeholder;
    i.value = value;
    i.style.cssText = `width:${width};background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui`;
    return i;
  };

  // A slower list for the previous project/person never lands last; loadedKey = the project the list shows ("" while loading).
  let seq = 0;
  let loadedKey = "";
  async function showList() {
    const mine = ++seq, key = pid();
    loadedKey = "";
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(key)}/members/me`);
      const j = await r.json().catch(() => ({}));
      if (mine !== seq) return;
      // Fail CLOSED (same rule as docs-panel): no answer → read-only; only the machine path is "service".
      myRole = r.ok ? ((j as { role?: string | null }).role ?? "viewer") : "viewer";
    } catch { if (mine !== seq) return; myRole = "viewer"; }

    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Deliverables";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const refresh = btn("↻");
    refresh.onclick = () => showList();
    bar.append(title);
    const tidpBtn = btn("By task team");
    tidpBtn.title = "The MIDP as ISO 19650 defines it — an aggregation of task-team TIDPs";
    tidpBtn.onclick = () => showTidp();
    const teamsBtn = btn("Teams");
    teamsBtn.title = "The responsibility matrix: who the task teams are and who is accountable for each";
    teamsBtn.onclick = () => showTeams();
    const reportBtn = btn("Weekly report");
    reportBtn.title = "The information-delivery status report, derived fresh — nothing carried forward from last week";
    reportBtn.onclick = () => void downloadReport();
    bar.append(tidpBtn, teamsBtn, reportBtn);
    if (canEdit()) {
      const rebaseBtn = btn("Rebaseline");
      rebaseBtn.title = "Re-import the programme and see what moving it does to the plan, before anything changes";
      rebaseBtn.onclick = () => showRebaseline();
      bar.append(rebaseBtn);
    }
    if (canEdit()) {
      const addBtn = btn("+ Add", true);
      const importBtn = btn("Paste schedule");
      addBtn.onclick = () => showAdd();
      importBtn.onclick = () => showImport();
      bar.append(addBtn, importBtn);
    }
    bar.append(refresh);

    body.replaceChildren();
    const loading = document.createElement("div");
    loading.textContent = "Loading…";
    loading.style.cssText = "color:#71717a;padding:1rem";
    body.append(loading);
    loadedKey = key;

    let report: StatusReport;
    try { report = await api(`/${encodeURIComponent(key)}/status`); }
    catch (e) { if (mine === seq) notRead(`Deliverables not read — ${(e as Error).message}`); return; }
    if (mine !== seq) return;

    body.replaceChildren();
    if (!report.rows.length) {
      const empty = document.createElement("div");
      empty.style.cssText = "color:#71717a;padding:1rem;line-height:1.6";
      empty.textContent = "No deliverables planned yet. Add rows, or paste a delivery schedule — each row names the container expected, who owes it, and when.";
      body.append(empty);
      return;
    }

    // Summary strip
    const sum = document.createElement("div");
    sum.style.cssText = "display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.6rem";
    for (const key of ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]) {
      const n = report.summary[key] || 0;
      if (!n) continue;
      const st = STATUS_STYLE[key];
      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${n} ${st.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.3rem;padding:.1rem .4rem;font:600 11px system-ui`;
      sum.append(chip);
    }
    body.append(sum);

    // Honesty note: the team column is the PLAN's expectation, not a verified attribution.
    const note = document.createElement("div");
    note.textContent = "Team is the planned owner — Sentinel records who published a container but cannot verify it was that team.";
    note.style.cssText = "color:#71717a;font:10.5px system-ui;margin-bottom:.5rem";
    body.append(note);

    // Exception register: only surfaced once there's something to say — either a real
    // exception, or the plan set an expectation at all (so "no exceptions" reads as earned).
    const anyExpectationSet = report.rows.some((r) => r.expected_revision || r.expected_suitability);
    if (report.exceptions.length || anyExpectationSet) {
      const reg = document.createElement("div");
      reg.style.cssText = "margin:.4rem 0 .6rem;border:1px solid #2a2a30;border-radius:.35rem;padding:.4rem .5rem;background:#17171c";
      const head = document.createElement("div");
      head.style.cssText = "display:flex;align-items:center;gap:.5rem;margin-bottom:.3rem";
      const ht = document.createElement("span");
      ht.textContent = `Exception register (${report.exceptions.length})`;
      ht.style.cssText = "font:600 12px system-ui;color:#eee;flex:1";
      head.append(ht);
      if (report.exceptions.length) {
        const dl = btn("Download CSV");
        dl.onclick = () => {
          const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const csv = ["container,due_date,severity,kind,problem,responsible_team,evidence",
            ...report.exceptions.map((e) => [e.container_name, e.due_date, e.severity, e.kind, e.problem, e.responsible_team, e.evidence].map(q).join(","))].join("\r\n");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
          a.download = `exceptions-${pid()}-${report.today}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        };
        head.append(dl);
      }
      reg.append(head);
      if (!report.exceptions.length) {
        // The green clean-bill line requires MEASUREMENTS, not merely a plan: with expectations
        // set but nothing published yet, nothing has been measured — saying "all met" would be
        // the unmeasured-pass this feature exists to prevent.
        const s = report.summary as Record<string, number>;
        const measured = (s.revision_met || 0) + (s.revision_mismatch || 0) + (s.suitability_met || 0) + (s.suitability_mismatch || 0) > 0;
        const okLine = document.createElement("div");
        okLine.textContent = measured
          ? "No exceptions — all measured expectations met."
          : "Expectations are set, but nothing has published yet — nothing measured.";
        okLine.style.cssText = `color:${measured ? "#22c55e" : "#9ca3af"};font:11px system-ui`;
        reg.append(okLine);
      }
      const sevColor: Record<string, string> = { high: "#f87171", medium: "#eab308", low: "#9ca3af" };
      for (const e of report.exceptions) {
        const line = document.createElement("div");
        line.style.cssText = "display:flex;gap:.5rem;align-items:baseline;padding:.15rem 0;font:11px system-ui;color:#cbd5e1";
        const sev = document.createElement("span");
        sev.textContent = e.severity.toUpperCase();
        sev.style.cssText = `color:${sevColor[e.severity] || "#9ca3af"};font:700 10px system-ui;min-width:3.6rem`;
        const nameEl = document.createElement("span");
        nameEl.textContent = e.container_name;
        nameEl.style.cssText = "font:600 11px ui-monospace,Consolas,monospace;color:#e5e7eb";
        const probEl = document.createElement("span");
        probEl.textContent = e.problem + (e.responsible_team ? ` · owed by ${e.responsible_team}` : "");
        probEl.style.cssText = "flex:1;min-width:0";
        line.append(sev, nameEl, probEl);
        reg.append(line);
      }
      body.append(reg);
    }

    // Sort: problems first, then by due date.
    const rank: Record<string, number> = { overdue: 0, late: 1, in_wip: 2, pending: 3, unscheduled: 4, delivered: 5 };
    const rows = [...report.rows].sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999")));

    for (const r of rows) {
      const st = STATUS_STYLE[r.status];
      const card = document.createElement("div");
      card.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;margin-bottom:.3rem";

      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${st.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.25rem;padding:0 .35rem;font:600 10.5px system-ui;white-space:nowrap;min-width:5.5rem;text-align:center`;

      const main = document.createElement("div");
      main.style.cssText = "flex:1;min-width:0";
      const nameRow = document.createElement("div");
      nameRow.style.cssText = "display:flex;align-items:center;gap:.35rem;min-width:0";
      const name = document.createElement("div");
      name.textContent = r.container_name;
      name.style.cssText = "font:600 12px ui-monospace,Consolas,monospace;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      nameRow.append(name);
      // Evidence chips: only when the plan actually set an expectation for this axis.
      const evChip = (axis: "revision" | "suitability", short: string) => {
        const v = r.evidence?.[axis];
        if (!v || v === "not_specified") return null;
        const actual = axis === "revision" ? r.evidence.actual_revisions : r.evidence.actual_suitabilities;
        const el2 = document.createElement("span");
        el2.textContent = v === "met" ? `${short} ✓` : v === "pending" ? `${short} …` : `${short} ✗ ${actual.join(",")}`;
        const color = v === "met" ? "#22c55e" : v === "pending" ? "#9ca3af" : "#f87171";
        el2.style.cssText = `color:${color};border:1px solid ${color}55;border-radius:.25rem;padding:0 .3rem;font:600 10px ui-monospace,Consolas,monospace;white-space:nowrap;flex:0 0 auto`;
        el2.title = axis === "revision" ? `expected ${r.expected_revision}` : `expected ${r.expected_suitability}`;
        return el2;
      };
      for (const c2 of [evChip("revision", "rev"), evChip("suitability", "suit")]) if (c2) nameRow.append(c2);
      const sub = document.createElement("div");
      const bits = [r.title, r.responsible_team ? `owed by ${r.responsible_team}` : null, r.stage, r.purpose ? `for: ${r.purpose}` : null].filter(Boolean).join(" · ");
      sub.textContent = bits;
      sub.style.cssText = "font:10.5px system-ui;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      main.append(nameRow, sub);

      const dates = document.createElement("div");
      dates.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#9ca3af;text-align:right;white-space:nowrap";
      const dueTxt = r.due_date ? `due ${r.due_date}` : "no due date";
      const gotTxt = r.published_at ? `published ${r.published_at}`
        : r.first_arrived_at ? `arrived ${r.first_arrived_at}, unissued`
        : "not delivered";
      dates.textContent = `${dueTxt} · ${gotTxt}${r.days_late ? ` · ${r.days_late}d late` : ""}`;

      card.append(chip, main, dates);
      if (canEdit()) {
        const edit = btn("Edit");
        edit.style.padding = ".1rem .35rem";
        edit.onclick = () => showAdd(r);
        const del = btn("✕");
        del.style.cssText += ";color:#fca5a5;border-color:#7f1d1d;padding:.1rem .35rem";
        let armed = false;
        del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = "Confirm?"; return; }
          try { await api(`/${encodeURIComponent(pid())}/${r.id}`, { method: "DELETE" }); await showList(); }
          catch (e) { msg(`Delete failed: ${(e as Error).message}`, true); }
        };
        card.append(edit, del);
      }
      body.append(card);
    }
  }

  function showAdd(existing?: Row) {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = existing ? "Edit deliverable" : "New deliverable";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const save = btn(existing ? "Save" : "Add", true);
    cancel.onclick = () => showList();
    bar.append(title, cancel, save);

    body.replaceChildren();
    const form = document.createElement("div");
    form.style.cssText = "display:flex;flex-direction:column;gap:.5rem;max-width:34rem";
    const nameI = field("Expected container name (required)", "100%", existing?.container_name || "");
    const titleI = field("Title, e.g. Stage 3 architectural model", "100%", existing?.title || "");
    const teamI = field("Responsible team (planned owner)", "100%", existing?.responsible_team || "");
    const dueI = field("Due date YYYY-MM-DD", "100%", existing?.due_date || "");
    dueI.type = "date";
    const stageI = document.createElement("select");
    stageI.style.cssText = "background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui";
    stageI.innerHTML = `<option value="">(no stage)</option>` + ["tender", "design", "coord", "constr", "hand", "oper"].map((s) => `<option value="${s}">${s}</option>`).join("");
    stageI.value = existing?.stage || "";
    const revI = field("Expected revision, e.g. P03 (optional)", "100%", existing?.expected_revision || "");
    const suitI = field("Expected suitability, e.g. S4 (optional)", "100%", existing?.expected_suitability || "");
    const purposeI = field("Which decision does this information support?", "100%", existing?.purpose || "");
    const label = (t: string, el: HTMLElement) => {
      const w = document.createElement("label");
      w.style.cssText = "display:flex;flex-direction:column;gap:.2rem;font:10.5px system-ui;color:#9ca3af";
      const s = document.createElement("span");
      s.textContent = t;
      w.append(s, el);
      return w;
    };
    form.append(
      label("Expected container name — how this deliverable is matched to what arrives", nameI),
      label("Title", titleI),
      label("Responsible team (the plan's expectation; not verified)", teamI),
      label("Due date", dueI),
      label("Stage", stageI),
      label("Expected revision at this milestone (optional)", revI),
      label("Expected suitability at this milestone (optional)", suitI),
      // The third leg of a plan. Without it this row is a document-register entry — which is exactly
      // what the midp.plan_completeness check reports, so the form must at least ask.
      label("Purpose — which decision this information supports", purposeI),
    );
    body.append(form);
    nameI.focus();

    save.onclick = async () => {
      save.disabled = true;
      const payload = {
        container_name: nameI.value, title: titleI.value, responsible_team: teamI.value,
        due_date: dueI.value, stage: stageI.value,
        expected_revision: revI.value, expected_suitability: suitI.value, purpose: purposeI.value, actor: await actor(),
      };
      try {
        if (existing) await api(`/${encodeURIComponent(pid())}/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        else await api(`/${encodeURIComponent(pid())}`, { method: "POST", body: JSON.stringify(payload) });
        await showList();
      } catch (e) {
        save.disabled = false;
        msg((e as Error).message, true);
      }
    };
  }

  function showImport() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Paste a delivery schedule";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const preview = btn("Preview", true);
    cancel.onclick = () => showList();
    bar.append(title, cancel, preview);

    body.replaceChildren();
    const help = document.createElement("div");
    help.textContent = "One row per line: container name, title, team, due date (YYYY-MM-DD), stage, expected revision, expected suitability. Tab- or comma-separated; the last two are optional. Nothing is saved until you confirm the preview.";
    help.style.cssText = "color:#9ca3af;font:10.5px system-ui;margin-bottom:.4rem";
    const ta = document.createElement("textarea");
    ta.style.cssText = "width:100%;min-height:9rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.35rem;padding:.5rem;font:11px ui-monospace,Consolas,monospace";
    const out = document.createElement("div");
    body.append(help, ta, out);

    preview.onclick = () => {
      const parsed = ta.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
        const [container_name, title2, responsible_team, due_date, stage, expected_revision, expected_suitability] = line.split(/\t|,/).map((c) => (c || "").trim());
        return { container_name, title: title2 || "", responsible_team: responsible_team || "", due_date: due_date || "", stage: stage || "", expected_revision: expected_revision || "", expected_suitability: expected_suitability || "" };
      });
      out.replaceChildren();
      if (!parsed.length) { msg("Nothing to import.", true); return; }
      const list = document.createElement("div");
      list.style.cssText = "margin-top:.5rem;display:flex;flex-direction:column;gap:.2rem";
      for (const p of parsed) {
        const li = document.createElement("div");
        li.textContent = `${p.container_name} · ${p.title || "—"} · ${p.responsible_team || "—"} · ${p.due_date || "no date"} · ${p.stage || "—"} · ${p.expected_revision || "—"}/${p.expected_suitability || "—"}`;
        li.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#cbd5e1";
        list.append(li);
      }
      const confirm = btn(`Import ${parsed.length} row(s)`, true);
      confirm.style.marginTop = ".5rem";
      confirm.onclick = async () => {
        confirm.disabled = true;
        try {
          await api(`/${encodeURIComponent(pid())}/import`, { method: "POST", body: JSON.stringify({ rows: parsed, actor: await actor() }) });
          await showList();
        } catch (e) {
          confirm.disabled = false;
          msg((e as Error).message, true);
        }
      };
      out.append(list, confirm);
    };
  }


  /** Shared chip strip for a status tally (same vocabulary and colours as the flat list). */
  function statusChips(summary: Record<string, number>): HTMLElement {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:.35rem;flex-wrap:wrap";
    for (const key of ["delivered", "late", "in_wip", "overdue", "pending", "unscheduled"]) {
      const n = summary[key] || 0;
      if (!n) continue;
      const st = STATUS_STYLE[key];
      const chip = document.createElement("span");
      chip.textContent = `${st.icon} ${n} ${st.label}`;
      chip.style.cssText = `color:${st.color};border:1px solid ${st.color}55;border-radius:.3rem;padding:.1rem .4rem;font:600 10.5px system-ui`;
      wrap.append(chip);
    }
    return wrap;
  }

  /** One compact deliverable line inside a TIDP group (the flat list owns the full card). */
  function miniRow(r: Row): HTMLElement {
    const st = STATUS_STYLE[r.status];
    const line = document.createElement("div");
    line.style.cssText = "display:flex;gap:.5rem;align-items:baseline;padding:.15rem .1rem;font:11px system-ui;color:#cbd5e1";
    const chip = document.createElement("span");
    chip.textContent = st.icon;
    chip.style.cssText = `color:${st.color};font:700 11px system-ui;min-width:1rem;text-align:center`;
    const name = document.createElement("span");
    name.textContent = r.container_name;
    name.style.cssText = "font:600 11px ui-monospace,Consolas,monospace;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:20rem";
    const detail = document.createElement("span");
    detail.textContent = [r.due_date ? `due ${r.due_date}` : "no due date", r.days_late ? `${r.days_late}d late` : null, r.purpose ? `for: ${r.purpose}` : null].filter(Boolean).join(" · ");
    detail.style.cssText = "flex:1;min-width:0;color:#9ca3af;font:10.5px system-ui;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    line.append(chip, name, detail);
    return line;
  }

  /**
   * The MIDP as an aggregation of TIDPs. Three things are deliberately NOT hidden, because each is
   * a finding the flat list cannot show: a declared team that planned nothing, a team named by the
   * plan that nobody declared, and rows owed by no one.
   */
  async function showTidp() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "MIDP — by task team";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const back = btn("← All deliverables");
    back.onclick = () => showList();
    const teamsBtn = btn("Teams");
    teamsBtn.onclick = () => showTeams();
    const refresh = btn("↻");
    refresh.onclick = () => showTidp();
    bar.append(title, back, teamsBtn, refresh);

    body.replaceChildren();
    const loading = document.createElement("div");
    loading.textContent = "Loading…";
    loading.style.cssText = "color:#71717a;padding:1rem";
    body.append(loading);

    let rep: TidpReport;
    try { rep = await api(`/${encodeURIComponent(pid())}/tidp`); }
    catch (e) { notRead(`TIDP not read — ${(e as Error).message}`); return; }

    body.replaceChildren();
    const head = document.createElement("div");
    head.style.cssText = "border:1px solid #2a2a30;background:#17171c;border-radius:.35rem;padding:.5rem;margin-bottom:.6rem";
    const ht = document.createElement("div");
    ht.textContent = `MIDP · ${rep.midp.total} deliverable(s) across ${rep.midp.task_teams_declared} declared task team(s)`;
    ht.style.cssText = "font:600 12px system-ui;color:#eee;margin-bottom:.35rem";
    head.append(ht, statusChips(rep.midp));
    body.append(head);

    const warn = (text: string, color = "#eab308") => {
      const d = document.createElement("div");
      d.textContent = text;
      d.style.cssText = `color:${color};font:10.5px system-ui;margin:.15rem 0`;
      body.append(d);
    };
    if (rep.midp.empty_tidps.length)
      warn(`${rep.midp.empty_tidps.length} declared team(s) have planned nothing at all: ${rep.midp.empty_tidps.join(", ")} — an empty TIDP, not a finished one.`);
    if (rep.midp.task_teams_undeclared)
      warn(`${rep.midp.task_teams_undeclared} team(s) are named by the plan but not declared in the responsibility matrix — nobody is accountable for them.`, "#f87171");
    if (rep.midp.unassigned)
      warn(`${rep.midp.unassigned} deliverable(s) name no task team at all.`, "#f87171");

    if (!rep.tidps.length && !rep.unassigned.rows.length) {
      const empty = document.createElement("div");
      empty.textContent = "No deliverables and no task teams yet. Declare the teams first, then plan what each one owes.";
      empty.style.cssText = "color:#71717a;padding:1rem;line-height:1.6";
      body.append(empty);
      return;
    }

    // At-risk teams first — a delivery meeting starts with who is behind, not with the alphabet.
    const ordered = [...rep.tidps].sort((a, b) => (b.at_risk - a.at_risk) || a.code.localeCompare(b.code));
    for (const t of ordered) {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;padding:.45rem .55rem;margin-bottom:.4rem";
      const top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:baseline;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem";
      const code = document.createElement("span");
      code.textContent = t.code;
      code.style.cssText = "font:700 12px ui-monospace,Consolas,monospace;color:#e5e7eb";
      const nm = document.createElement("span");
      nm.textContent = [t.name, t.discipline, t.appointment].filter(Boolean).join(" · ");
      nm.style.cssText = "font:11px system-ui;color:#9ca3af;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      top.append(code, nm);
      if (!t.declared) {
        const und = document.createElement("span");
        und.textContent = "not declared";
        und.style.cssText = "color:#f87171;border:1px solid #f8717155;border-radius:.25rem;padding:0 .3rem;font:600 10px system-ui";
        top.append(und);
      }
      const lead = document.createElement("span");
      lead.textContent = t.lead_email ? `lead ${t.lead_email}` : "no accountable lead";
      lead.style.cssText = `font:10.5px system-ui;color:${t.lead_email ? "#9ca3af" : "#f87171"}`;
      top.append(lead);
      if (t.next_due) {
        const nd = document.createElement("span");
        nd.textContent = `next due ${t.next_due}`;
        nd.style.cssText = "font:10.5px ui-monospace,Consolas,monospace;color:#93c5fd";
        top.append(nd);
      }
      card.append(top, statusChips(t.summary));
      if (!t.rows.length) {
        const none = document.createElement("div");
        none.textContent = "This TIDP is empty — the team has planned no deliverables.";
        none.style.cssText = "color:#eab308;font:10.5px system-ui;margin-top:.25rem";
        card.append(none);
      }
      const rank: Record<string, number> = { overdue: 0, late: 1, in_wip: 2, pending: 3, unscheduled: 4, delivered: 5 };
      for (const r of [...t.rows].sort((a, b) => (rank[a.status] - rank[b.status]) || String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"))))
        card.append(miniRow(r));
      body.append(card);
    }

    if (rep.unassigned.rows.length) {
      const card = document.createElement("div");
      card.style.cssText = "border:1px dashed #7f1d1d;background:#1b1b21;border-radius:.35rem;padding:.45rem .55rem;margin-bottom:.4rem";
      const t2 = document.createElement("div");
      t2.textContent = "Owed by no one";
      t2.style.cssText = "font:700 12px system-ui;color:#fca5a5;margin-bottom:.25rem";
      card.append(t2, statusChips(rep.unassigned.summary));
      for (const r of rep.unassigned.rows) card.append(miniRow(r));
      body.append(card);
    }
  }

  /** The responsibility matrix itself: declare the task teams and name who is accountable. */
  async function showTeams(editing?: Team | null) {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Task teams — responsibility matrix";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const back = btn("← All deliverables");
    back.onclick = () => showList();
    bar.append(title, back);
    if (canEdit() && !editing) {
      const add = btn("+ Declare team", true);
      add.onclick = () => showTeams({ id: "", code: "", name: null, lead_email: null, discipline: null, appointment: null, notes: null });
      bar.append(add);
    }

    body.replaceChildren();

    if (editing) {
      const form = document.createElement("div");
      form.style.cssText = "display:flex;flex-direction:column;gap:.5rem;max-width:34rem";
      const codeI = field("Code, e.g. ARC (matches the deliverable's team)", "100%", editing.code || "");
      const nameI = field("Name, e.g. Architecture — Badran Design Studio", "100%", editing.name || "");
      // Lead is picked from the project's members (a datalist keeps free text for a consultant not yet registered).
      const leadI = field("Lead email — the accountable human", "100%", editing.lead_email || "");
      const leadList = document.createElement("datalist"); leadList.id = `team-leads-${pid()}`;
      leadI.setAttribute("list", leadList.id); leadI.type = "email"; leadI.autocomplete = "off";
      try {
        const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members`);
        if (r.ok) for (const m of (await r.json()) as { email: string; role: string }[])
          if (String(m.email || "").includes("@")) leadList.append(new Option(`${m.role}`, m.email));
      } catch { /* free text still works */ }
      form.append(leadList);   // the input is not in the DOM yet — a datalist only works once it is attached
      const discI = field("Discipline (optional)", "100%", editing.discipline || "");
      const apptI = field("Appointment, e.g. lead / delivery (optional)", "100%", editing.appointment || "");
      const notesI = field("Notes (optional)", "100%", editing.notes || "");
      const label = (t: string, el: HTMLElement) => {
        const w = document.createElement("label");
        w.style.cssText = "display:flex;flex-direction:column;gap:.2rem;font:10.5px system-ui;color:#9ca3af";
        const sp = document.createElement("span");
        sp.textContent = t;
        w.append(sp, el);
        return w;
      };
      form.append(
        label("Code — deliverables are matched to this team by it, case-insensitively", codeI),
        label("Name", nameI),
        label("Accountable lead — roles.responsibility reports a team without one", leadI),
        label("Discipline", discI),
        label("Position in the appointment chain", apptI),
        label("Notes", notesI),
      );
      const save = btn(editing.id ? "Save" : "Declare", true);
      const cancel = btn("Cancel");
      cancel.onclick = () => showTeams();
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:.4rem";
      actions.append(save, cancel);
      form.append(actions);
      body.append(form);
      codeI.focus();

      save.onclick = async () => {
        save.disabled = true;
        const payload = {
          code: codeI.value, name: nameI.value, lead_email: leadI.value,
          discipline: discI.value, appointment: apptI.value, notes: notesI.value, actor: await actor(),
        };
        try {
          const base = `${SERVICE_URL.replace(/\/$/, "")}/teams/${encodeURIComponent(pid())}`;
          const r = await bfetch(editing.id ? `${base}/${editing.id}` : base, {
            method: editing.id ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
          await showTeams();
        } catch (e) {
          save.disabled = false;
          msg((e as Error).message, true);
        }
      };
      return;
    }

    let teams: Team[];
    try {
      const r = await bfetch(`${SERVICE_URL.replace(/\/$/, "")}/teams/${encodeURIComponent(pid())}`);
      const j = await r.json().catch(() => ([]));
      if (!r.ok) throw new Error((j as { message?: string }).message || `HTTP ${r.status}`);
      teams = j as Team[];
    } catch (e) { msg(`Couldn't load task teams: ${(e as Error).message}`, true); return; }

    const help = document.createElement("div");
    help.textContent = "A task team is the ISO 19650 unit of production — it owns a TIDP and names one accountable person. A deliverable pointing at a team that is not declared here is a responsibility gap, and roles.responsibility reports it.";
    help.style.cssText = "color:#9ca3af;font:10.5px system-ui;margin-bottom:.5rem;line-height:1.5";
    body.append(help);

    if (!teams.length) {
      const empty = document.createElement("div");
      empty.textContent = "No task teams declared yet.";
      empty.style.cssText = "color:#71717a;padding:1rem";
      body.append(empty);
      return;
    }

    for (const t of teams) {
      const card = document.createElement("div");
      card.style.cssText = "display:flex;align-items:center;gap:.5rem;padding:.4rem .5rem;border:1px solid #2a2a30;background:#1b1b21;border-radius:.35rem;margin-bottom:.3rem";
      const code = document.createElement("span");
      code.textContent = t.code;
      code.style.cssText = "font:700 12px ui-monospace,Consolas,monospace;color:#e5e7eb;min-width:4rem";
      const main = document.createElement("div");
      main.style.cssText = "flex:1;min-width:0";
      const nm = document.createElement("div");
      nm.textContent = t.name || "(unnamed)";
      nm.style.cssText = "font:600 11.5px system-ui;color:#e5e7eb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      const sub = document.createElement("div");
      sub.textContent = [t.discipline, t.appointment, t.notes].filter(Boolean).join(" · ");
      sub.style.cssText = "font:10.5px system-ui;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      main.append(nm, sub);
      const lead = document.createElement("span");
      lead.textContent = t.lead_email || "no accountable lead";
      lead.style.cssText = `font:10.5px system-ui;color:${t.lead_email ? "#9ca3af" : "#f87171"};white-space:nowrap`;
      card.append(code, main, lead);
      if (canEdit()) {
        const edit = btn("Edit");
        edit.style.padding = ".1rem .35rem";
        edit.onclick = () => showTeams(t);
        const del = btn("✕");
        del.style.cssText += ";color:#fca5a5;border-color:#7f1d1d;padding:.1rem .35rem";
        let armed = false;
        del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = "Confirm?"; return; }
          try {
            const r = await bfetch(`${SERVICE_URL.replace(/\/$/, "")}/teams/${encodeURIComponent(pid())}/${t.id}`, { method: "DELETE" });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            await showTeams();
          } catch (e) { msg(`Delete failed: ${(e as Error).message}`, true); }
        };
        card.append(edit, del);
      }
      body.append(card);
    }
  }


  /** The weekly report — fetched as markdown and handed over as a file. */
  async function downloadReport() {
    try {
      const rep = await api(`/${encodeURIComponent(pid())}/report`) as { markdown: string; today: string };
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([rep.markdown], { type: "text/markdown" }));
      a.download = `information-delivery-status-${pid()}-${rep.today}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      msg("Weekly report downloaded.");
    } catch (e) { msg(`Couldn't build the report: ${(e as Error).message}`, true); }
  }

  type Rebaseline = {
    updates: { id: string; container_name: string; from: string | null; to: string | null; delta_days: number | null }[];
    unchanged: { container_name: string }[];
    unmatched: { container_name: string; due_date: string | null }[];
    malformed: { container_name: string; due_date: string }[];
    untouched: { container_name: string; due_date: string | null }[];
    transitions: { container_name: string; from_status: string; to_status: string; from_due: string | null; to_due: string | null; worse: boolean }[];
    newly_at_risk: number;
    applied?: number;
  };

  /**
   * Re-import the programme. The preview is the point: a date change that quietly turns six pending
   * rows overdue is the thing a BEP hides, so nothing is written until that consequence is on screen.
   */
  function showRebaseline() {
    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Rebaseline from the programme";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const cancel = btn("Cancel");
    const preview = btn("Preview", true);
    cancel.onclick = () => showList();
    bar.append(title, cancel, preview);

    body.replaceChildren();
    const help = document.createElement("div");
    help.textContent = "One row per line: container name, then the new due date (YYYY-MM-DD). Tab- or comma-separated. Nothing is written until you confirm — the preview shows what the move does to every deliverable's status first.";
    help.style.cssText = "color:#9ca3af;font:10.5px system-ui;margin-bottom:.4rem;line-height:1.5";
    const ta = document.createElement("textarea");
    ta.style.cssText = "width:100%;min-height:9rem;box-sizing:border-box;background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.35rem;padding:.5rem;font:11px ui-monospace,Consolas,monospace";
    const out = document.createElement("div");
    body.append(help, ta, out);

    const parse = () => ta.value.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
      const [container_name, due_date] = line.split(/\t|,/).map((c) => (c || "").trim());
      return { container_name, due_date: due_date || "" };
    });

    const section = (heading: string, lines: string[], color = "#cbd5e1") => {
      if (!lines.length) return;
      const h = document.createElement("div");
      h.textContent = heading;
      h.style.cssText = "font:600 11.5px system-ui;color:#eee;margin:.5rem 0 .2rem";
      out.append(h);
      for (const t of lines) {
        const d = document.createElement("div");
        d.textContent = t;
        d.style.cssText = `font:10.5px ui-monospace,Consolas,monospace;color:${color}`;
        out.append(d);
      }
    };

    preview.onclick = async () => {
      const rows = parse();
      out.replaceChildren();
      if (!rows.length) { msg("Nothing to rebaseline.", true); return; }
      let r: Rebaseline;
      try { r = await api(`/${encodeURIComponent(pid())}/rebaseline`, { method: "POST", body: JSON.stringify({ rows }) }); }
      catch (e) { msg((e as Error).message, true); return; }

      const headline = document.createElement("div");
      headline.textContent = r.newly_at_risk
        ? `This move puts ${r.newly_at_risk} deliverable(s) into a worse position.`
        : r.updates.length ? `${r.updates.length} date(s) move; no deliverable ends up worse off.` : "The programme matches the plan — nothing moves.";
      headline.style.cssText = `font:600 12px system-ui;color:${r.newly_at_risk ? "#f87171" : "#22c55e"};margin-top:.5rem`;
      out.append(headline);

      section("Status changes", r.transitions.map((t) =>
        `${t.worse ? "▲" : "▼"} ${t.container_name}: ${t.from_status} → ${t.to_status}  (${t.from_due || "no date"} → ${t.to_due || "no date"})`), "#e5e7eb");
      section("Dates moving", r.updates.map((u) =>
        `${u.container_name}: ${u.from || "no date"} → ${u.to || "no date"}${u.delta_days === null ? "" : `  (${u.delta_days > 0 ? "+" : ""}${u.delta_days}d)`}`));
      section("In the programme but not in the plan (nothing created)", r.unmatched.map((u) => `${u.container_name} · ${u.due_date || "no date"}`), "#eab308");
      section("Unusable dates (ignored, never blanked)", r.malformed.map((m) => `${m.container_name} · ${m.due_date}`), "#f87171");
      section("In the plan but not mentioned by this programme", r.untouched.map((u) => `${u.container_name} · ${u.due_date || "no date"}`), "#9ca3af");

      if (!r.updates.length) return;
      const confirm = btn(`Apply ${r.updates.length} date change(s)`, true);
      confirm.style.marginTop = ".6rem";
      confirm.onclick = async () => {
        confirm.disabled = true;
        try {
          const done = await api(`/${encodeURIComponent(pid())}/rebaseline`, { method: "POST", body: JSON.stringify({ rows, apply: true, actor: await actor() }) }) as Rebaseline;
          msg(`Rebaselined ${done.applied} deliverable(s) — each change is on the ledger.`);
          await showList();
        } catch (e) { confirm.disabled = false; msg((e as Error).message, true); }
      };
      out.append(confirm);
    };
  }

  // An open add/import/rebaseline/team form for the same project is not reloaded away (inputs exist only in forms);
  // a new project always reloads.
  onActiveProjectChange(() => {
    if (pid() === loadedKey && body.querySelector("input, textarea, select")) return;
    void showList();
  });
  void showList();
  return root;
}
