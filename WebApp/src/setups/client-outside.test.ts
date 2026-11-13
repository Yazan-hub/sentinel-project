import { describe, it, expect, vi } from "vitest";
import { clientOutsideBlock, CLIENT_OUTSIDE_TITLE } from "./client-outside";
import { fakeDocument, findAll, textOf, click } from "../workspace/fake-dom";

const tick = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buttons = (el: any) => findAll(el, "button");

describe("Project Settings: the client is not in Sentinel", () => {
  it("off: an owner sees Turn on; the change asks for the opposite; a refusal is shown in the bridge's words and the button comes back", async () => {
    const change = vi.fn(async () => "The Client is already in Sentinel: they accept in the round. Remove the Client first if they should be outside");
    const el = clientOutsideBlock(fakeDocument(), { on: false, can_change: true, has_client: false }, change);
    expect(textOf(el)).toContain(CLIENT_OUTSIDE_TITLE);
    expect(textOf(el)).toContain("Off: the client is a member");
    expect(buttons(el).map((b) => textOf(b))).toEqual(["Turn on"]);
    click(buttons(el)[0]); await tick();
    expect(change).toHaveBeenCalledWith(true);
    expect(textOf(el)).toContain("Remove the Client first");
    expect((buttons(el)[0] as HTMLButtonElement).disabled).toBe(false);
  });
  it("on: Turn off; a success asks nothing more of the block", async () => {
    const change = vi.fn(async () => null);
    const el = clientOutsideBlock(fakeDocument(), { on: true, can_change: true, has_client: false }, change);
    expect(textOf(el)).toContain("On: the client is outside Sentinel.");
    click(buttons(el)[0]); await tick();
    expect(change).toHaveBeenCalledWith(false);
  });
  it("a lead only reads it; with a Client already a member there is no Turn on, and the words say why", () => {
    expect(buttons(clientOutsideBlock(fakeDocument(), { on: false, can_change: false, has_client: false }, async () => null))).toHaveLength(0);
    const el = clientOutsideBlock(fakeDocument(), { on: false, can_change: true, has_client: true }, async () => null);
    expect(buttons(el)).toHaveLength(0);
    expect(textOf(el)).toContain("The client is already a member");
  });
});
