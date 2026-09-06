import { useEffect, useState } from "react";

/**
 * Reads blog content that is usually already here and occasionally has to be
 * fetched.
 *
 * Both blog pages have the same shape: the data they need was written into the
 * page by the prerender, so the first render — the one a crawler sees and the
 * one React hydrates — is complete and synchronous. Only a client-side
 * navigation to a different article has to go and get anything.
 *
 * The initial state is computed from `source.ready` rather than starting at
 * "loading" and filling in from an effect. That is the whole point: effects do
 * not run during server rendering, so a hook that started empty would render a
 * spinner into the HTML and hand the crawler a page with no article on it.
 *
 * @param {{ready: any, load: () => Promise<any>}} source from src/lib/blog.js
 * @param {string} key what identifies this resource — refetches when it changes
 */
export default function useBlogResource(source, key) {
  const [state, setState] = useState(() =>
    source.ready ? { status: "ready", data: source.ready } : { status: "loading", data: null }
  );

  useEffect(() => {
    if (source.ready) {
      setState({ status: "ready", data: source.ready });
      return undefined;
    }
    let live = true;
    setState({ status: "loading", data: null });
    source
      .load()
      .then((data) => {
        if (!live) return;
        setState(data ? { status: "ready", data } : { status: "missing", data: null });
      })
      .catch((error) => {
        if (live) setState({ status: "error", data: null, error });
      });
    return () => {
      live = false;
    };
    // `source` is rebuilt on every render, so keying on it would refetch
    // forever. The key is what actually identifies the content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
