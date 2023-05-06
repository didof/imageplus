#!/usr/bin/env node

import yargs from "yargs";
import sharp, { FormatEnum } from "sharp";
import path from "path";
import fs from "fs";

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
          default: "240,380,640,1180,1280,1920",
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
        argv.async
      );
    }
  )
  .parse();

async function generateImages(
  imagePath: string,
  alt: string,
  outputDir: string,
  sizes: string[],
  formats: Formats[],
  lazy: boolean,
  async: boolean
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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
      console.error(
        `could not generate ${result.reason.output.path}: ${result.reason.error}`
      );
      return;
    }

    const { type } = result.value.output;
    const srcsetList: string[] = grouped.get(type) || [];
    srcsetList.push(result.value.output.srcset);
    grouped.set(type, srcsetList);
  }

  const sourceTags: string[] = [];
  for (let [type, srcsetList] of grouped.entries()) {
    const sourceTag = `<source
    sizes="(max-width: ${sizes[sizes.length - 1]}px) 100vw, ${
      sizes[sizes.length - 1]
    }px"
    srcset="${srcsetList.join(", ")}"
    type="${type}"
  />`;
    sourceTags.push(sourceTag);
  }

  const imageName = path.basename(imagePath, path.extname(imagePath));
  const fallbackPath = path.join(outputDir, path.basename(imagePath));
  await copyImage(imagePath, fallbackPath);

  const htmlContent = `<picture>
      ${sourceTags.join("\n  ")}
      <img src="${fallbackPath}" alt="${alt}" ${lazy ? 'loading="lazy"' : ""} ${
    async ? 'decoding="async"' : ""
  }/>
    </picture>`;

  const htmlFilePath = path.join(outputDir, `${imageName}.html`);
  fs.writeFileSync(htmlFilePath, htmlContent);

  console.log(`Generated HTML file: ${htmlFilePath}`);
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
