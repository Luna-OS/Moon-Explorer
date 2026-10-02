import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemoBridge } from "@/fs/demo";
import { DefaultFileManagerSetting } from "./DefaultFileManagerSetting";

const label = "Use as default file manager";

describe("the default-file-manager setting", () => {
  it("switches on and off through the bridge", async () => {
    const bridge = new DemoBridge();
    render(<DefaultFileManagerSetting bridge={bridge} />);
    const toggle = screen.getByRole("switch", { name: label });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent("Windows Explorer is the default");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toBeChecked());
    expect(bridge.defaultFm.state).toBe("on");
    expect(screen.getByRole("status")).toHaveTextContent("open in Moon Explorer");

    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(bridge.defaultFm.state).toBe("off");
  });

  it("offers to register again when the app was moved", async () => {
    const bridge = new DemoBridge();
    bridge.defaultFm = { ...bridge.defaultFm, state: "stale", enabled: true, needsAttention: true };
    render(<DefaultFileManagerSetting bridge={bridge} />);
    const again = await screen.findByRole("button", { name: "Register again" });
    expect(screen.getByRole("status")).toHaveTextContent("another copy of Moon Explorer");
    fireEvent.click(again);
    await waitFor(() => expect(bridge.defaultFm.state).toBe("on"));
    expect(screen.queryByRole("button", { name: "Register again" })).not.toBeInTheDocument();
  });

  it("is disabled where it can't work", async () => {
    const bridge = new DemoBridge();
    bridge.defaultFm = { state: "unsupported", enabled: false, needsAttention: false, targets: [] };
    render(<DefaultFileManagerSetting bridge={bridge} />);
    await screen.findByText("Only available in the desktop app on Windows.");
    expect(screen.getByRole("switch", { name: label })).toBeDisabled();
  });

  it("shows an error and keeps the switch usable", async () => {
    const bridge = new DemoBridge();
    bridge.setDefaultFileManager = () => Promise.reject(new Error("Registry access failed"));
    render(<DefaultFileManagerSetting bridge={bridge} />);
    const toggle = screen.getByRole("switch", { name: label });
    await waitFor(() => expect(toggle).toBeEnabled());
    fireEvent.click(toggle);
    await screen.findByText("Couldn't change it: Registry access failed");
    expect(toggle).toBeEnabled();
    expect(toggle).not.toBeChecked();
  });
});
