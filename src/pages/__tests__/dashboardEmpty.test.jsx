/**
 * The dashboard's empty states. A personal account is offered the screenshot
 * drop; a team library keeps its own message and must not show it.
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => {} }),
}));
vi.mock("../../lib/teamContext", () => ({ useTeam: () => ({}) }));

const { EmptyState } = await import("../Dashboard.jsx");
const render = (el) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);

describe("dashboard empty state", () => {
  it("offers a personal account the screenshot drop, accepting several files", () => {
    const html = render(<EmptyState onCreate={() => {}} onDropImage={() => {}} dropError="" creating={false} teamName={null} />);
    expect(html).toContain("Drop your first app screenshot");
    expect(html).toContain("Start from a template");
    expect(html).toMatch(/<input[^>]*accept="image\/\*"[^>]*multiple/);
  });
  it("shows the error text it is given", () => {
    const html = render(<EmptyState onCreate={() => {}} onDropImage={() => {}} dropError="Drop screenshot images (PNG or JPG). Folders and other files cannot be used." creating={false} teamName={null} />);
    expect(html).toContain("Drop screenshot images (PNG or JPG). Folders and other files cannot be used.");
    expect(html).toContain('role="alert"');
  });
  it("keeps a team library's own message and has no screenshot drop", () => {
    const html = render(<EmptyState onCreate={() => {}} onDropImage={() => {}} dropError="" creating={false} teamName="Acme" />);
    expect(html).toContain("Nothing shared with Acme yet");
    expect(html).toContain("Create a team project");
    expect(html).not.toContain("Drop your first app screenshot");
  });
  it("disables the button while a project is being created", () => {
    const html = render(<EmptyState onCreate={() => {}} onDropImage={() => {}} dropError="" creating={true} teamName={null} />);
    expect(html).toContain("Opening…");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Opening…/s);
  });
});
