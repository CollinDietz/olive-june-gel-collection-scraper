const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const sharp = require("sharp");

const BASE_URL = "https://oliveandjune.com";
const COLLECTION_URL = `${BASE_URL}/collections/gel-polish`;

const axiosInstance = axios.create({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115 Safari/537.36",
  },
});

async function parse_product($, el) {
  const name = $(el).find(".grid-view-item__title").text().trim();

  // ✅ Filter out empty names (non-product blocks)
  if (!name) return;

  const price = $(el).find(".product-price").text().trim();

  const relativeUrl = $(el).find("a").attr("href");
  const url = relativeUrl ? BASE_URL + relativeUrl : null;

  // const imageSrc = $(el).find("a img").first().attr("src");
  // const image = imageSrc
  //   ? imageSrc.startsWith("http")
  //     ? imageSrc
  //     : "https:" + imageSrc
  //   : null;

  const isNew = $(el).find('img[src*="NEW.png"]').length > 0;

  const id = $(el).attr("id") || "";
  const color = $(el).attr("data-color") || "";
  const color_kind = $(el).attr("data-colorkind") || "";
  const undertone = $(el).attr("data-colorundertone") || "";
  const season = $(el).attr("data-colorseason") || "";
  const variantId = $(el).find(".quick-add").attr("data-id") || "";

  const product_details = await scrape_product_page(url);

  console.log(`💅 Parsed ${name}`);

  return {
    id,
    variantId,
    name,
    price,
    url,
    // image,
    isNew,
    color,
    color_kind,
    undertone,
    season,
    ...product_details,
  };
}

async function scrape_main_page() {
  try {
    const { data: html } = await axiosInstance.get(COLLECTION_URL);
    // fs.writeFileSync(
    //   path.join(__dirname, "assets", "html", "collection.html"),
    //   html
    // );
    const $ = cheerio.load(html);

    const products = [];

    for (const el of $("li.indiv-gel").toArray()) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const product = await parse_product($, el);
      if (product) products.push(product);
    }

    return products;
  } catch (err) {
    console.error("Error scraping:", err.message);
  }
}

function extractRelatedCollectionPolishes($) {
  const polishes = [];

  $("section.swatch-cross-sell a.swatch-link").each((_, el) => {
    const $el = $(el);

    const href = $el.attr("href") || "";
    const id = href.split("/").pop();
    const style = $el.attr("style") || "";
    const colorMatch = style.match(/background-color:\s*([^;]+)/i);
    const color = colorMatch ? colorMatch[1].trim() : null;

    // ✅ Skip if no background color (invisible swatch)
    if (!color || color === "") return;

    polishes.push({
      id,
      color,
    });
  });

  return polishes;
}

function extractDescription($) {
  const descContainer = $(".product-single__description");

  if (!descContainer.length) return "";

  const paragraphs = descContainer
    .find("p")
    .map((i, el) => $(el).text().trim())
    .get();
  const listItems = descContainer
    .find("li")
    .map((i, el) => "• " + $(el).text().trim())
    .get();

  return [...paragraphs, ...listItems]
    .join("\n")
    .split("DID YOU KNOW?")[0]
    .trim();
}

function extractCarouselImages($, type) {
  const images = [];

  $(`.product-images__${type} img`).each((i, el) => {
    let src = $(el).attr("src") || $(el).attr("data-src");
    if (src && !src.startsWith("http")) {
      src = "https:" + src;
    }
    if (src) {
      images.push(src);
    }
  });

  return images;
}

function findProductId($) {
  const forms = $("form");

  for (let i = 0; i < forms.length; i++) {
    const form = forms[i];
    const $form = $(form);

    const productId = $form.attr("data-productid");
    if (productId) {
      return productId;
    }
  }

  return null; // not found
}

function extractFinishType($) {
  const finishTypeLink = $('a[href="#finish-type"].underline');
  if (finishTypeLink.length) {
    return finishTypeLink.text().trim();
  }
  return null;
}

function extractColorDescription($) {
  const colorDesc = $(".colot-desc").text().trim();
  return colorDesc;
}

async function scrape_product_page(productUrl) {
  try {
    const { data: html } = await axiosInstance.get(productUrl);
    // fs.writeFileSync(
    //   path.join(__dirname, "assets", "html", slugify(productUrl) + ".html"),
    //   html
    // );
    const $ = cheerio.load(html);

    const productId = findProductId($);
    const description = extractDescription($);
    const images = extractCarouselImages($, "slide");
    // const carouselThumbImages = extractCarouselImages($, "thumb");
    const relatedCollectionPolishes = extractRelatedCollectionPolishes($);
    const finishType = extractFinishType($);
    const colorDescription = extractColorDescription($);

    return {
      productId,
      colorDescription,
      finishType,
      description,
      images,
      thumbNailImage: images[0],
      relatedCollectionPolishes,
      // carouselThumbImages,
    };
  } catch (err) {
    console.warn(
      `❌ Failed to fetch details for ${productUrl}: ${err.message}`
    );
    return {};
  }
}

async function downloadImage(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios.get(url, { responseType: "stream" });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function removeWhiteBackground(inputPath, outputPath) {
  const TOLERANCE = 4; // how “white” a pixel must be to become transparent (0–255)
  const image = sharp(inputPath);
  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const visited = new Uint8Array(width * height);

  // Get top-left pixel color
  const getIndex = (x, y) => (y * width + x) * 4;
  const baseR = data[0];
  const baseG = data[1];
  const baseB = data[2];

  // Only proceed if the top-left pixel is pure white (255,255,255)
  if (!(baseR === 255 && baseG === 255 && baseB === 255)) {
    // Top-left pixel is not white, skip processing
    console.log(
      `⚠️ Top-left pixel is not white, skipping background removal: ${outputPath}`
    );
    return;
  }

  // Helper to check if pixel matches background color
  function matchesBackground(r, g, b) {
    return (
      Math.abs(r - baseR) < TOLERANCE &&
      Math.abs(g - baseG) < TOLERANCE &&
      Math.abs(b - baseB) < TOLERANCE
    );
  }

  // BFS flood-fill
  const queue = [[0, 0]];
  visited[0] = 1;

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    const i = getIndex(x, y);
    data[i + 3] = 0; // make transparent

    // check neighbors
    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = getIndex(nx, ny);
      const idx = ny * width + nx;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const r = data[ni];
      const g = data[ni + 1];
      const b = data[ni + 2];
      if (matchesBackground(r, g, b)) queue.push([nx, ny]);
    }
  }

  await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  console.log(`✅ Magic-select background removed: ${outputPath}`);

  return outputPath;
}

async function downloadImagesAndUpdateJson(products) {
  const baseDir = path.join(__dirname, "assets", "images");
  fs.mkdirSync(baseDir, { recursive: true });

  const updatedProducts = [];

  for (const product of products) {
    const slug = slugify(product.name);
    // const productDir = path.join(baseDir, slug);
    // fs.mkdirSync(productDir, { recursive: true });

    const localPathMap = {};
    const collect = async (urls, type) => {
      const localPaths = [];
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const ext = path.extname(url.split("?")[0]) || ".png";
        const fileName = `${slug}_${type}_${i}${ext}`;
        const outputPath = path.join(baseDir, fileName);
        const localPath = path.join("assets", "images", fileName);

        try {
          await downloadImage(url, outputPath);
          console.log(`💅 Downloaded ${fileName}`);
          localPathMap[url] = localPath;
          localPaths.push(localPath);
        } catch (err) {
          console.warn(`❌ Failed to download ${url}: ${err.message}`);
          localPaths.push(url); // fallback
        }
      }
      return localPaths;
    };

    const slideImages = await collect(product.images, "slide");
    const thumbNailImagePreProcess = await collect(
      [product.thumbNailImage],
      "thumbnail"
    );
    const thumbNailImage = await removeWhiteBackground(
      thumbNailImagePreProcess[0],
      thumbNailImagePreProcess[0]
    );
    // const thumbImages = await collect(product.carouselThumbImages, 'thumb');
    // const mainImageList = await collect([product.image], 'main');

    updatedProducts.push({
      ...product,
      // image: mainImageList[0] || product.image,
      images: slideImages,
      thumbNailImage: thumbNailImage,
      // carouselThumbImages: thumbImages,
    });
  }

  return updatedProducts;
}

async function main() {
  const baseDir = path.join(__dirname, "assets", "data");
  fs.mkdirSync(baseDir, { recursive: true });
  const products = await scrape_main_page();
  const updated = await downloadImagesAndUpdateJson(products);

  fs.writeFileSync(
    baseDir + "/gel_polishes.json",
    JSON.stringify(updated, null, 2)
  );
}

main();
