// In-page questions. The That Open platform runs the app in an iframe sandbox without allow-modals, so
// window.prompt() returns null and window.confirm() returns false there without ever showing anything
// (F-LC-6, 2026-10-24: every Documents publish got the default "vN" label). The HTML <dialog> element is
// not a browser modal, so the sandbox allows it. `doc` exists only so the node test can pass a stand-in.

export type AskOpts = { ok?: string; cancel?: string; placeholder?: string; doc?: Document };

const BTN = (primary: boolean) =>
  `border:1px solid #2c2c34;background:${primary ? "#2563eb" : "#1f1f27"};color:${primary ? "#fff" : "#c9cfda"};border-radius:.35rem;padding:.3rem .6rem;font:600 11px system-ui;cursor:pointer`;

function open(kind: "text" | "yesno", question: string, opts: AskOpts): Promise<{ ok: boolean; value: string }> {
  const d = opts.doc ?? document;
  const dlg = d.createElement("dialog");
  dlg.style.cssText = "background:#18181b;color:#e4e4e7;border:1px solid #3f3f46;border-radius:.5rem;padding:.9rem 1rem;max-width:26rem;font:13px system-ui";
  const form = d.createElement("form");
  form.method = "dialog"; // a submit button closes the dialog with its value as returnValue; Escape closes with ""
  const q = d.createElement("p");
  q.textContent = question;
  q.style.cssText = "margin:0 0 .7rem;white-space:pre-wrap;line-height:1.4";
  form.append(q);
  let input: HTMLInputElement | null = null;
  if (kind === "text") {
    input = d.createElement("input");
    input.type = "text";
    input.placeholder = opts.placeholder ?? "";
    input.style.cssText = "width:100%;box-sizing:border-box;margin:0 0 .7rem;padding:.35rem .5rem;background:#09090b;color:inherit;border:1px solid #3f3f46;border-radius:.35rem;font:inherit";
    form.append(input);
  }
  const button = (label: string, value: string, primary: boolean) => {
    const b = d.createElement("button");
    b.type = "submit";
    b.value = value;
    b.textContent = label;
    b.style.cssText = BTN(primary);
    return b;
  };
  const ok = button(opts.ok ?? "OK", "ok", true);
  const cancel = button(opts.cancel ?? "Cancel", "cancel", false);
  const row = d.createElement("div");
  // Tree order decides what Enter does. A text question submits through its first button, so OK comes first
  // (shown on the right). A yes/no question opens focused on its first button, so Cancel comes first and Enter
  // never confirms a revoke or a retire by accident.
  row.style.cssText = kind === "text" ? "display:flex;gap:.5rem;flex-direction:row-reverse" : "display:flex;gap:.5rem;justify-content:flex-end";
  row.append(...(kind === "text" ? [ok, cancel] : [cancel, ok]));
  form.append(row);
  dlg.append(form);
  d.body.append(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener("close", () => {
      const value = input?.value.trim() ?? "";
      dlg.remove();
      resolve({ ok: dlg.returnValue === "ok", value });
    });
    // showModal runs before the caller's first await, so the page is inert before a second click can land (no
    // stacked questions). If the dialog cannot open (a detached document), the answer is a cancel, never a hang.
    try { dlg.showModal(); } catch { dlg.remove(); resolve({ ok: false, value: "" }); }
  });
}

/** A yes/no question. True only when the person presses the OK button; Cancel, Escape and closing give false. */
export const askYesNo = async (question: string, opts: AskOpts = {}): Promise<boolean> => (await open("yesno", question, opts)).ok;

/** A one-line text question. The trimmed text on OK (it may be ""); null on Cancel, Escape or closing. */
export const askText = async (question: string, opts: AskOpts = {}): Promise<string | null> => {
  const r = await open("text", question, opts);
  return r.ok ? r.value : null;
};
