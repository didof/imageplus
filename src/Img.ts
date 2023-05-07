import sharp from "sharp";
import { VirtualTag } from "./VirtualTag";
import path from "path";

export enum ImgLoading {
  Eager = "eager",
  Lazy = "lazy",
}

export enum ImgDecoding {
  Sync = "sync",
  Async = "async",
  Auto = "auto",
}

export class Img extends VirtualTag {
  private readonly styleMap: Map<string, string>;

  constructor(private readonly src: string, private readonly alt: string) {
    super("img");
    this.setAttribute("loading", ImgLoading.Eager);
    this.setAttribute("decoding", ImgDecoding.Sync);
    this.styleMap = new Map();
  }

  public static fromImagePath(
    imagePath: string,
    outputDir: string,
    alt: string
  ): Img {
    const src = path.join(outputDir, path.basename(imagePath));
    return new Img(src, alt);
  }

  public setLoading(loading: ImgLoading): this {
    return this.setAttribute("loading", loading);
  }

  public setDeconding(deconding: ImgDecoding): this {
    return this.setAttribute("decoding", deconding);
  }

  public async useLQIP(width = 20): Promise<void> {
    return sharp(this.src)
      .resize(width)
      .toFormat("jpg")
      .toBuffer()
      .then((buffer) => buffer.toString("base64"))
      .then((base64String) => {
        this.styleMap.set(
          "background",
          `url(data:image/jpeg;base64,${base64String})`
        );
        this.styleMap.set("background-size", "cover");
        this.styleMap.set("background-repeat", "no-repeat");
      });
  }

  public setStyle(key: string, value: string): this {
    this.styleMap.set(key, value);
    return this;
  }

  public toString(): string {
    let values: string[] = [];
    for (const [key, value] of this.styleMap.entries()) {
      values.push(`${key}: ${value};`);
    }
    this.setAttribute("style", values.join(" "));
    return this.build();
  }
}
