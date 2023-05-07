#!/usr/bin/env node

import yargs from "yargs";
import sharp, { FormatEnum } from "sharp";
import path from "path";
import fs from "fs";
import { Source } from "./Source";
import { Img, ImgDecoding, ImgLoading } from "./Img";
import { Picture } from "./Picture";

enum Formats {
  Avif = "avif",
  Webp = "webp",
  Png = "png",
  Jpg = "jpg",
}

const levels: Record<Formats, number> = {
  [Formats.Avif]: 4,
  [Formats.Webp]: 3,
  [Formats.Png]: 2,
  [Formats.Jpg]: 1,
};

yargs
  .version("1.0.0")
  .command<{
    image: string;
    alt: string;
    output: string;
    sizes: string[];
    formats: Formats[];
    lazy: boolean;
    async: boolean;
    LQIP: boolean;
  }>(
    "$0",
    "Image Generator CLI",
    (yargs) => {
      yargs
        .option("image", {
          describe: "Path to the source image",
          demandOption: true,
          type: "string",
        })
        .option("alt", {
          describe: "Alternative text of the image",
          demandOption: true,
          type: "string",
        })
        .option("output", {
          describe: "Path to the output directory for generated images",
          demandOption: true,
          type: "string",
        })
        .option("sizes", {
          describe: "Comma-separated list of sizes",
          type: "string",
          default: "240,380,640,860,1280,1920",
          coerce(arg: string): string[] {
            return arg.split(",");
          },
        })
        .option("formats", {
          describe: "Comma-separated list of formats",
          type: "string",
          default: "avif,webp,png,jpg",
          coerce(arg: string): Formats[] {
            return arg
              .split(",")
              .map((format) => <Formats>format)
              .sort((a, b) => (levels[b] || 0) - (levels[a] || 0));
          },
        })
        .option("lazy", {
          describe:
            "Instruct the browser to only start fetching the image as it gets closer to the view",
          type: "boolean",
          default: true,
        })
        .option("async", {
          describe:
            "Instruct the browser to decode the image off the main thread",
          type: "boolean",
          default: true,
        })
        .option("LQIP", {
          describe: "Generate the 20 pixels wide Low Quality Image Placeholder",
          type: "boolean",
          default: true,
        });
    },
    async (argv) => {
      await generateImages(
        argv.image,
        argv.alt,
        argv.output,
        argv.sizes,
        argv.formats,
        argv.lazy,
        argv.async,
        argv.LQIP
      );
    }
  )
  .parse();

type NullError = Error | null;

function assertDirExists(path: string): NullError {
  const stats = fs.statSync(path);

  if (!stats.isDirectory()) {
    return new Error(`path '${path}' already exists and is not a directory`);
  }

  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }

  return null;
}

async function generateImages(
  imagePath: string,
  alt: string,
  outputDir: string,
  sizes: string[],
  formats: Formats[],
  lazy: boolean,
  async: boolean,
  LQIP: boolean
): Promise<NullError> {
  var err: NullError;
  if ((err = assertDirExists(outputDir))) {
    return err;
  }

  const promises: (() => ReturnType<typeof generate>)[] = [];
  for (const format of formats) {
    for (const size of sizes) {
      promises.push(() =>
        generate({ imagePath, outputDir, size: parseInt(size, 10), format })
      );
    }
  }

  const grouped: Map<string, string[]> = new Map();
  const results = await Promise.allSettled(
    promises.map((promise) => promise())
  );

  for (const result of results) {
    if (result.status === "rejected") {
      return new Error(
        `could not generate ${result.reason.output.path}: ${result.reason.error}`
      );
    }

    const { type } = result.value.output;
    const srcsetList: string[] = grouped.get(type) || [];
    srcsetList.push(result.value.output.srcset);
    grouped.set(type, srcsetList);
  }

  const sources: Source[] = [];
  for (let [type, srcsetList] of grouped.entries()) {
    const source = new Source(type)
      .addSrcsets(...srcsetList)
      .setMaxWidth(sizes.at(sizes.length - 1)!);
    sources.push(source);
  }

  const imageName = path.basename(imagePath, path.extname(imagePath));
  const fallbackPath = path.join(outputDir, path.basename(imagePath));
  await copyImage(imagePath, fallbackPath);

  // TODO add to style: "content-visibility: auto;"
  // TODO add to style: "max-width: 100%; height: auto;"

  const img = Img.fromImagePath(imagePath, outputDir, alt);
  if (lazy) {
    img.setLoading(ImgLoading.Lazy);
  }
  if (async) {
    img.setDeconding(ImgDecoding.Async);
  }
  if (LQIP) {
    await img.useLQIP();
  }

  const html = new Picture(img).addSources(...sources).toString();

  const htmlFilePath = path.join(outputDir, `${imageName}.html`);
  fs.writeFileSync(htmlFilePath, html);

  return null;
}

type GenerateInput = {
  imagePath: string;
  outputDir: string;
  size: number;
  format: keyof FormatEnum;
};

type GenerateOutput = {
  srcset: string;
  type: string;
};

function generate(
  input: GenerateInput
): Promise<{ input: GenerateInput; output: GenerateOutput }> {
  return new Promise((resolve, reject) => {
    const extention = path.extname(input.imagePath);
    let imageName = path.basename(input.imagePath, extention);
    imageName = `${imageName}-${input.size}.${input.format}`;

    const outPath = path.join(input.outputDir, imageName);
    const output = {
      srcset: `${outPath} ${input.size}w`,
      type: `image/${input.format}`,
    };

    sharp(input.imagePath)
      .resize(input.size)
      .toFormat(input.format)
      .toFile(outPath)
      .then(() => resolve({ input, output }))
      .catch((error) => reject({ error, input, output }));
  });
}

async function copyImage(
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.copyFile(sourcePath, destinationPath, (error) => {
      if (error) {
        reject({ error, sourcePath, destinationPath });
        return;
      }
      resolve(void 0);
    });
  });
}

async function createLQIP(imagePath: string): Promise<{
  background: string;
  ["background-size"]: string;
  ["background-repeat"]: string;
}> {
  return new Promise((resolve, reject) => {
    // TODO handle error, wrap sharp in custom Promise system
    sharp(imagePath)
      .resize(20)
      .toFormat("jpg")
      .toBuffer()
      .then((buffer) => buffer.toString("base64"))
      .then((base64String) =>
        resolve({
          background: `url(data:image/jpeg;base64,${base64String})`,
          "background-size": "cover",
          "background-repeat": "no-repeat",
        })
      );
  });
}
