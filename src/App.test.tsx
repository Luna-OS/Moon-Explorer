import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import { resolveTheme } from "@/theme/useTheme";

describe("App", () => {
  it("renders the themed explorer shell", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Moon Explorer" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Contents of Documents" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("switches between the night and day theme", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent.click(screen.getByRole("button", { name: "Night" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("follows the OS only for the system choice", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });
});
