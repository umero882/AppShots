import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PhotoFrame } from "../PhotoFrame.jsx";
import { defaultCorners } from "../../lib/warp.js";

const frame = { image: "data:image/png;base64,FRAME", corners: defaultCorners() };

const render = (props) =>
  renderToStaticMarkup(<PhotoFrame frame={frame} image="data:image/png;base64,SHOT" width={300} height={600} {...props} />);

describe("PhotoFrame", () => {
  it("warps the screenshot with a matrix3d transform", () => {
    const html = render();
    expect(html).toContain("data:image/png;base64,SHOT");
    expect(html).toContain("matrix3d(");
  });
  it("composites the device frame on top", () => {
    expect(render()).toContain("data:image/png;base64,FRAME");
  });
  it("shows 4 corner pins only when editable", () => {
    const plain = render({ editable: false });
    const edit = render({ editable: true });
    expect(plain.match(/cursor-move/g) || []).toHaveLength(0);
    expect((edit.match(/cursor-move/g) || []).length).toBe(4);
  });
});
