const fs = require("fs").promises;
const path = require("path");

// ✅ ALL TEMP DIRECTORIES
const tempDirs = [
  path.join(__dirname, "../public/img/temp"),
];

const ONE_HOUR = 60 * 60 * 1000;

// 🔒 PREVENT MULTIPLE RUNS
let isCleaning = false;

// 🔥 CLEAN TEMP FILES
const cleanTempFolder = async () => {

  if (isCleaning) return; // ✅ avoid overlapping
  isCleaning = true;

  try {

    for (const tempDir of tempDirs) {

      try {
        await fs.access(tempDir);
      } catch {
        continue; // skip if folder not exists
      }

      const files = await fs.readdir(tempDir);

      for (const file of files) {

        const filePath = path.join(tempDir, file);

        try {
          const stats = await fs.stat(filePath);

          const fileAge = Date.now() - stats.mtimeMs;

          // 🔥 delete files older than 1 hour
          if (fileAge > ONE_HOUR) {

            await fs.unlink(filePath);
            console.log("🧹 Deleted temp:", filePath);

          }

        } catch (err) {
          console.error("❌ File error:", filePath, err.message);
        }

      }

    }

  } catch (err) {
    console.error("❌ Cleanup error:", err.message);
  } finally {
    isCleaning = false; // ✅ release lock
  }
};

module.exports = cleanTempFolder;