import { Palette } from "lucide-react";
import { useTeam } from "../lib/teamContext";

/**
 * The workspace's brand colours, one click from wherever a colour is chosen.
 *
 * The point of a brand kit is that nobody has to paste a hex code from a doc, so
 * it belongs next to the colour pickers rather than on a settings page. Renders
 * nothing when there is no workspace or no colours saved.
 */
export default function BrandSwatches({ value, onPick, label = "Brand" }) {
  const { brand, team } = useTeam();
  const colors = brand?.colors || [];
  if (!team || !colors.length) return null;

  return (
    <div className="mt-3">
      <p className="label flex items-center gap-1.5">
        <Palette size={12} /> {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            title={c}
            aria-label={`Brand colour ${c}`}
            className={`h-8 w-8 rounded-lg ring-2 transition ${
              String(value || "").toLowerCase() === c.toLowerCase() ? "ring-white" : "ring-white/10 hover:ring-white/30"
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}
