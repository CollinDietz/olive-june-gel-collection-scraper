const axios = require("axios");
const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

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

  const color = $(el).attr("data-color") || "";
  const color_kind = $(el).attr("data-colorkind") || "";
  const undertone = $(el).attr("data-colorundertone") || "";
  const season = $(el).attr("data-colorseason") || "";
  const variantId = $(el).find(".quick-add").attr("data-id") || "";

  const product_details = await scrape_product_page(url);

  console.log(`💅 Parsed ${name}`);

  return {
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
    const $ = cheerio.load(html);

    const products = [];

    for (const el of $("li.indiv-gel").toArray()) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const product = await parse_product($, el);
      if (product) products.push(product);
    }

    return products;
  } catch (err) {
    console.error("Error scraping:", err.message);
  }
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

async function scrape_product_page(productUrl) {
  try {
    const { data: html } = await axiosInstance.get(productUrl);
    const $ = cheerio.load(html);

    const productId = findProductId($);
    const description = extractDescription($);
    const carouselSlideImages = extractCarouselImages($, "slide");
    // const carouselThumbImages = extractCarouselImages($, "thumb");

    return {
      productId,
      description,
      carouselSlideImages,
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

async function downloadImagesAndUpdateJson(products) {
  const baseDir = path.join(__dirname, "assets", "images");
  fs.mkdirSync(baseDir, { recursive: true });

  const updatedProducts = [];

  for (const product of products) {
    const slug = slugify(product.name);
    const productDir = path.join(baseDir, slug);
    fs.mkdirSync(productDir, { recursive: true });

    const localPathMap = {};

    const collect = async (urls, type) => {
      const localPaths = [];
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const ext = path.extname(url.split("?")[0]) || ".png";
        const fileName = `${slug}_${type}_${i}${ext}`;
        const outputPath = path.join(productDir, fileName);
        const localPath = `assets/images/${slug}/${fileName}`;

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

    const slideImages = await collect(product.carouselSlideImages, "slide");
    // const thumbImages = await collect(product.carouselThumbImages, 'thumb');
    // const mainImageList = await collect([product.image], 'main');

    updatedProducts.push({
      ...product,
      // image: mainImageList[0] || product.image,
      carouselSlideImages: slideImages,
      // carouselThumbImages: thumbImages,
    });
  }

  return updatedProducts;
}

async function main() {
  const products = await scrape_main_page();
  const updated = await downloadImagesAndUpdateJson(products);

  const baseDir = path.join(__dirname, "assets", "data");
  fs.mkdirSync(baseDir, { recursive: true });

  fs.writeFileSync(
    baseDir + "/gel_polishes.json",
    JSON.stringify(updated, null, 2)
  );
}

main();
