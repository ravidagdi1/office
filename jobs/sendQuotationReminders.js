const Quotation = require("../models/Quotation");
const { sendWhatsApp } = require("../services/whatsappService");

const sendQuotationReminders = async () => {
  try {
    const now = new Date();

    // 2 days before expiry = day 5 reminder
    const start = new Date(now);
    start.setHours(0,0,0,0);

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const quotes = await Quotation.find({
      expiryDate: { $gte: start, $lt: end },
      reminderSent: false,
      status: { $in: ["Sent", "Partially-Replied"] }
    });

    for (const quote of quotes) {
      for (const supplier of quote.suppliers) {
        if (supplier.status !== "Replied") {
          await sendWhatsApp({
            to: supplier.phone,
            message: `⏰ Reminder: Quotation REQ ${quote.requisitionNo} (Batch ${quote.batchNo}) will expire in 2 days. Please submit your rates.`
          });
        }
      }

      await Quotation.updateOne(
        { _id: quote._id },
        { $set: { reminderSent: true, lastReminderAt: new Date() } }
      );
    }

  } catch (err) {
    console.error("Reminder job error:", err);
  }
};

module.exports = sendQuotationReminders;
