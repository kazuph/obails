import { describe, expect, it } from "vitest";
import { renderIcon, setButtonIcon } from "../../lib/icons";

describe("icons", () => {
  it("renders svg markup for known icons", () => {
    expect(renderIcon("edit")).toContain("<svg");
    expect(renderIcon("folder-open")).toContain("<svg");
  });

  it("sets button inner html", () => {
    const button = document.createElement("button");
    setButtonIcon(button, "refresh");
    expect(button.innerHTML).toContain("<svg");
  });
});
