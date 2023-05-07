import { VirtualTag } from "./VirtualTag";

export class Source extends VirtualTag {
  private readonly srcset: string[];
  constructor(private readonly type: string) {
    super("source");
    this.srcset = [];
    this.setAttribute("type", type);
  }

  public addSrcsets(...srcset: string[]): this {
    this.srcset.push(...srcset);
    return this;
  }

  public setMaxWidth(maxWidth: string): this {
    this.setAttribute(
      "sizes",
      `(max-width: ${maxWidth}px) 100vw, ${maxWidth}px`
    );
    return this;
  }

  public toString(): string {
    this.setAttribute("srcset", this.srcset.join(", "));
    return this.build();
  }
}
