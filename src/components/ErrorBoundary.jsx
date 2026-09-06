import { Component } from "react";
import { AlertTriangle } from "lucide-react";
import { reportError } from "../lib/errorReporter";

/**
 * Catches a render crash so the user sees a page instead of a white screen, and
 * reports it — an unreported white screen is a bug we only hear about if someone
 * bothers to email us.
 *
 * Reload is the offered action rather than "try again": a crashed render usually
 * left state we cannot trust.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { kind: "react", componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-ink-950 px-6 text-center">
        <div className="max-w-md">
          <AlertTriangle size={32} className="mx-auto text-amber-400" />
          <h1 className="mt-4 text-xl font-bold text-white">Something broke on this page</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sorry — that's on us. We've been told about it. Your saved projects are safe.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload the page
            </button>
            <a href="/dashboard" className="btn-ghost">
              Back to projects
            </a>
          </div>
        </div>
      </div>
    );
  }
}
