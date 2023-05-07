export class VirtualTag {
  private readonly map: Map<string, string>;
  constructor(private readonly tagName: string) {
    this.map = new Map();
  }

  protected setAttribute(key: string, value: string): this {
    this.map.set(key, value);
    return this;
  }

  protected build(): string {
    const l = [`<${this.tagName}`];

    for (let [key, value] of this.map.entries()) {
      l.push(`${key}="${value}"`);
    }

    return l.concat(">").join(" ");
  }
}
