const cron = require("node-cron");
const { sendPOEmailsService } = require("../utils/poEmailService");

// Every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  console.log("⏳ Running PO Email Cron Job at", new Date());
  try {
    const result = await sendPOEmailsService();
    console.log("✅ Emails sent via cron:", result);
  } catch (err) {
    console.error("❌ Cron job failed:", err.message, err.stack);
  }
});

