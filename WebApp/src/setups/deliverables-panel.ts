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
  expected_revision: string | null; expected_suitability: string | null; evidence: Evidence;
};
type StatusReport = { generated_at: string; today: string; rows: Row[]; summary: Record<string, number>; exceptions: Exception[] };

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
  const field = (placeholder: string, width = "9rem", value = "") => {
    const i = document.createElement("input");
    i.placeholder = placeholder;
    i.value = value;
    i.style.cssText = `width:${width};background:#111;color:#e5e7eb;border:1px solid #2c2c34;border-radius:.3rem;padding:.25rem .4rem;font:11px system-ui`;
    return i;
  };

  async function showList() {
    try {
      const r = await bfetch(`${base}/cde/${encodeURIComponent(pid())}/members/me`);
      const j = await r.json().catch(() => ({}));
      myRole = (j as { role?: string | null }).role ?? "service";
    } catch { myRole = "service"; }

    bar.replaceChildren();
    const title = document.createElement("span");
    title.textContent = "Deliverables";
    title.style.cssText = "font:600 13px system-ui;color:#eee;flex:1";
    const refresh = btn("↻");
    refresh.onclick = () => showList();
    bar.append(title);
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

    let report: StatusReport;
    try { report = await api(`/${encodeURIComponent(pid())}/status`); }
    catch (e) { body.replaceChildren(); msg(`Couldn't load deliverables: ${(e as Error).message}`, true); return; }

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
      const bits = [r.title, r.responsible_team ? `owed by ${r.responsible_team}` : null, r.stage].filter(Boolean).join(" · ");
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
    );
    body.append(form);
    nameI.focus();

    save.onclick = async () => {
      save.disabled = true;
      const payload = {
        container_name: nameI.value, title: titleI.value, responsible_team: teamI.value,
        due_date: dueI.value, stage: stageI.value,
        expected_revision: revI.value, expected_suitability: suitI.value, actor: await actor(),
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

  onActiveProjectChange(() => void showList());
  void showList();
  return root;
}
