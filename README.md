# Olive & June Gel Polish Scraper

A Node.js scraper that extracts product data and images from [Olive & June's gel polish collection](https://oliveandjune.com/collections/gel-polish), bundles assets for offline use, and uploads them as GitHub Releases. Designed to feed a Flutter app with product metadata and local image assets.

---

## Features

- Scrapes product list with details (name, price, color, season, etc.)
- Fetches detailed product descriptions from individual product pages
- Extracts all product images and organizes them in a logical folder structure
- Generates a `manifest.json` describing products and asset paths
- Compresses assets into a tarball (`assets.tar.gz`)
- Uploads the tarball to GitHub Releases with date-stamped tags (e.g. `gel-collection-2025-07-24`)
- Designed for automation via GitHub Actions with configurable periodic runs

---

## Getting Started

---

### Use

```bash
npm install
node ./index.js
```
