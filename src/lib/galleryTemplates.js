import { LAYOUTS } from "./templates";

export function textPosFor(layoutId) {
  const l = LAYOUTS.find((x) => x.id === layoutId) || LAYOUTS[0];
  return l.textPos;
}

function freshId() {
  return Math.random().toString(36).slice(2, 9);
}

export function templateToProjectState(template) {
  const { deviceId, layoutId, deviceScale, background, text } = template.style;
  return {
    deviceId,
    layoutId,
    deviceScale,
    background: { ...background },
    text: { ...text },
    screens: template.screens.map((s) => ({
      id: freshId(),
      heading: s.heading,
      subheading: s.subheading || "",
      image: s.image ?? null,
    })),
  };
}

export function applyTemplateStyle(prevState, template) {
  const { deviceId, layoutId, deviceScale, background, text } = template.style;
  return {
    ...prevState,
    deviceId,
    layoutId,
    deviceScale,
    background: { ...background },
    text: { ...text },
  };
}

export function filterTemplates(templates, { category = "All", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return templates.filter(
    (t) =>
      (category === "All" || t.category === category) &&
      (!q ||
        t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q))
  );
}
