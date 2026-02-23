/**
 * Génère les icônes PWA (192x192 et 512x512) à partir du logo.
 * Le visuel remplit toute la place, comme les apps natives.
 */
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const LOGO_PATH = path.join(PUBLIC_DIR, "logo.png");
const SIZES = [192, 512];

async function generateIcons() {
  const logoBuffer = await sharp(LOGO_PATH);

  for (const size of SIZES) {
    const outputPath = path.join(PUBLIC_DIR, `icon-${size}.png`);
    await logoBuffer
      .clone()
      .resize(size, size, { fit: "cover" })
      .png()
      .toFile(outputPath);
    console.log(`✓ Généré: icon-${size}.png`);
  }

  console.log("Icônes PWA générées avec succès.");
}

generateIcons().catch((err) => {
  console.error("Erreur:", err);
  process.exit(1);
});
