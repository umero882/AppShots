import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

// Navbar reads auth state; the legal pages must render for logged-out visitors.
vi.mock("../../lib/auth", () => ({
  useAuth: () => ({ user: null, loading: false, signOut: async () => {} }),
}));

const { default: Privacy } = await import("../Privacy.jsx");
const { default: Terms } = await import("../Terms.jsx");
const { default: Footer } = await import("../../components/Footer.jsx");

const render = (el, path = "/") => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>);

describe("legal pages", () => {
  it("renders the Privacy Policy with its sections and contact details", () => {
    const html = render(<Privacy />, "/privacy");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("Last updated: 6 September 2026");
    expect(html).toContain("Next Tech Labs");
    expect(html).toContain("mailto:nextechlabs.dev@gmail.com");
    // Names the real processors, not boilerplate.
    for (const vendor of ["Firebase", "Stripe", "Anthropic", "Pexels", "Hostinger"]) expect(html).toContain(vendor);
    expect(html).toContain('href="/terms"');
    // Every section is reachable from the contents list.
    const ids = [...html.matchAll(/<section id="([a-z-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(8);
    for (const id of ids) expect(html).toContain(`href="#${id}"`);
  });

  it("renders the Terms of Service with billing, IP, and governing-law terms", () => {
    const html = render(<Terms />, "/terms");
    expect(html).toContain("Terms of Service");
    expect(html).toContain("Subscriptions, billing, and refunds");
    expect(html).toContain("Governing law and disputes");
    expect(html).toContain("Sharjah");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Not affiliated with Apple or Google");
  });

  it("footer links to the legal pages and real destinations (no dead # links)", () => {
    const html = render(<Footer />);
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('href="#"');
    expect(html).not.toContain("demo clone");
  });
});
