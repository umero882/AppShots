import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import Navbar from "../components/Navbar";
import TemplateGrid from "../components/TemplateGrid";
import { useAuth } from "../lib/auth";
import { backend } from "../lib/backend";
import { templateToProjectState } from "../lib/galleryTemplates";

/**
 * Public inspiration gallery: browse complete, polished screenshot designs for
 * ideas. Picking one starts a project from it (or routes to sign-up when logged
 * out). Fully self-contained — reuses the template catalog + canvas renderer.
 */
export default function Inspiration() {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function startFrom(template) {
    if (!user) {
      navigate("/signup");
      return;
    }
    const project = await backend.createProject(user.id, {
      name: template.name,
      state: templateToProjectState(template),
    });
    navigate(`/editor/${project.id}`);
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-5 py-10">
        <div className="mb-8 max-w-2xl">
          <span className="chip mb-3 inline-flex">
            <Sparkles size={13} className="text-brand-300" /> Inspiration
          </span>
          <h1 className="text-3xl font-bold text-white sm:text-4xl">
            App screenshot inspiration
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Browse complete, store-ready screenshot designs across every style. Find one you
            love and {user ? "start a project from it" : "sign up to make it yours"} in one click.
          </p>
        </div>

        <TemplateGrid onSelect={startFrom} />
      </main>
    </div>
  );
}
