import { describe, it, expect } from "vitest";
import { classifySentiment } from "./sentiment.js";

describe("classifySentiment", () => {
  it("phân loại đúng các đánh giá 1 sao và 2 sao là negative", () => {
    expect(classifySentiment(1)).toBe("negative");
    expect(classifySentiment(2)).toBe("negative");
  });

  it("phân loại đúng đánh giá 3 sao là neutral", () => {
    expect(classifySentiment(3)).toBe("neutral");
  });

  it("phân loại đúng các đánh giá 4 sao và 5 sao là positive", () => {
    expect(classifySentiment(4)).toBe("positive");
    expect(classifySentiment(5)).toBe("positive");
  });
});

