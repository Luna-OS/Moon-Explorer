import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DemoBridge } from "@/fs/demo";
import { Dialogs } from "./Dialogs";
import { Workspace } from "./model/workspace";

const FILE = "C:\\Users\\Luna\\Documents\\tokens.css";

async function openChecksums() {
  const bridge = new DemoBridge();
  const ws = new Workspace(bridge, localStorage);
  await ws.init();
  ws.showChecksums(await bridge.stat(FILE));
  render(<Dialogs ws={ws} />);
  return { ws, bridge, sums: await bridge.checksums(FILE) };
}

describe("the checksums dialog", () => {
  it("shows SHA-256, SHA-1 and MD5 and copies them", async () => {
    const { bridge, sums } = await openChecksums();
    expect(await screen.findByText(sums.sha256)).toBeInTheDocument();
    expect(screen.getByText(sums.sha1)).toBeInTheDocument();
    expect(screen.getByText(sums.md5)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy SHA-1" }));
    expect(bridge.shellCalls.at(-1)).toEqual({ action: "copyText", target: sums.sha1 });
  });

  it("compares with a pasted value, ignoring case and spaces", async () => {
    const { sums } = await openChecksums();
    await screen.findByText(sums.sha256);
    const field = screen.getByRole("textbox", { name: "Compare with a published checksum" });
    fireEvent.change(field, { target: { value: ` ${sums.md5.toUpperCase()} ` } });
    expect(screen.getByText("✓ Matches the MD5 checksum.")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "deadbeef" } });
    expect(screen.getByText("✗ Doesn't match any of them.")).toBeInTheDocument();
  });
});
