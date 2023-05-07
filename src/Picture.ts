import { Img } from "./Img";
import { Source } from "./Source";

export class Picture {
  private readonly sources: Source[];
  constructor(private readonly img: Img) {
    this.sources = [];
  }

  addSources(...sources: Source[]): this {
    this.sources.push(...sources);
    return this;
  }

  public toString(): string {
    return `<picture>${this.sources
      .map((source) => source.toString())
      .join("")}${this.img.toString()}</picture>`;
  }
}
