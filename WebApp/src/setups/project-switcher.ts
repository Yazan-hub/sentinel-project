import { activePid, setActiveProjectKey, onActiveProjectChange } from "./active-project";

/**
 * Global project switcher (Phase 1) — a small persistent pill, layout-independent, that always shows the
 * active project and lets you jump to another one from anywhere in the app. It floats over the shell
 * (fixed position) rather than living inside a BUI layout so it survives activity-bar navigation. Reads
 * the same governed list as the hub (`/cde/projects`) and drives the same active-project state.
 *
 * Position is top-centre by default (BIM viewers keep that strip free); tweak `anchor` if it collides
 * with the platform toolbar in your embed.
 */

interface ProjectLite {
  key: string;
  name: string;
}

export function projectSwitcher(
  opts: { baseUrl?: string; onManage?: () => void; anchor?: string } = {},
): HTMLElement {
  const base = (opts.baseUrl ?? "http://localhost:4100").replace(/\/$/, "");
  const esc = (s?: string) =>
    (s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

  let projects: ProjectLite[] = [];
  let openMenu = false;

  const wrap = document.createElement("div");
  wrap.style.cssText =
    (opts.anchor ?? "position:fixed;top:.5rem;left:50%;transform:translateX(-50%)") +
    ";z-index:1000;font:13px system-ui";

  const nameFor = (key: string) => projects.find((p) => p.key === key)?.name ?? key;

  const render = () => {
    const key = activePid();
    wrap.innerHTML =
      '<button id="psw-pill" title="Switch project" style="display:flex;align-items:center;gap:.45rem;' +
      "background:#16161ae6;backdrop-filter:blur(6px);border:1px solid #2c2c34;border-radius:100px;" +
      'padding:.35rem .7rem;color:#eee;cursor:pointer;box-shadow:0 4px 14px #0006;max-width:20rem">' +
      '<span style="color:#c4b5fd;font-size:12px">◫</span>' +
      `<span style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(nameFor(key))}</span>` +
      `<span style="font:10px ui-monospace,Consolas,monospace;color:#6b7280">${esc(key)}</span>` +
      '<span style="color:#9ca3af;font-size:10px">▾</span>' +
      "</button>" +
      (openMenu
        ? '<div id="psw-menu" style="position:absolute;top:calc(100% + .35rem);left:0;min-width:16rem;max-height:60vh;overflow:auto;' +
          "background:#16161a;border:1px solid #2c2c34;border-radius:.6rem;box-shadow:0 10px 30px #0008;padding:.35rem\">" +
          (projects.length
            ? projects
                .map((p) => {
                  const on = p.key === key;
                  return (
                    `<button class="psw-item" data-key="${esc(p.key)}" style="width:100%;text-align:left;cursor:pointer;` +
                    `display:flex;flex-direction:column;gap:.1rem;border:0;border-radius:.4rem;padding:.4rem .55rem;` +
                    `background:${on ? "#6528d714" : "transparent"};color:inherit">` +
                    `<span style="font-weight:600;color:${on ? "#c4b5fd" : "#e5e7eb"}">${esc(p.name)}</span>` +
                    `<span style="font:10px ui-monospace,Consolas,monospace;color:#6b7280">${esc(p.key)}</span></button>`
                  );
                })
                .join("")
            : '<div style="color:#6b7280;font-size:12px;padding:.5rem">No projects yet.</div>') +
          '<div style="border-top:1px solid #23232a;margin:.3rem 0"></div>' +
          '<button id="psw-manage" style="width:100%;text-align:left;cursor:pointer;border:0;border-radius:.4rem;' +
          'padding:.4rem .55rem;background:transparent;color:#9ca3af;font-size:12px">⚙ Manage projects…</button>' +
          "</div>"
        : "");

    (wrap.querySelector("#psw-pill") as HTMLElement).addEventListener("click", (e) => {
      e.stopPropagation();
      openMenu = !openMenu;
      if (openMenu) load();
      render();
    });
    wrap.querySelectorAll<HTMLElement>(".psw-item").forEach((b) =>
      b.addEventListener("click", () => {
        setActiveProjectKey(b.dataset.key!);
        openMenu = false;
        render();
      }),
    );
    const manage = wrap.querySelector("#psw-manage");
    if (manage)
      manage.addEventListener("click", () => {
        openMenu = false;
        render();
        opts.onManage?.();
      });
  };

  const load = async () => {
    try {
      const r = await fetch(`${base}/cde/projects`);
      if (!r.ok) return; // 503/offline → keep showing the active key, no list
      projects = (await r.json()).map((p: ProjectLite) => ({ key: p.key, name: p.name }));
      render();
    } catch {
      /* bridge down — pill still shows the active key */
    }
  };

  // Close the menu on any outside click.
  document.addEventListener("click", () => {
    if (openMenu) {
      openMenu = false;
      render();
    }
  });
  // Keep the label in sync when the hub (or anything else) switches project.
  onActiveProjectChange(() => render());

  render();
  load();
  return wrap;
}
