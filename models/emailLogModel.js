const mongoose = require("mongoose");

const emailLogSchema = new mongoose.Schema({
  to: { type: String, required: true },          // recipient email
  subject: { type: String, required: true },     // email subject
  message: { type: String },                     // plain text or summary
  html: { type: String },                        // HTML content (optional)
  status: { type: String, enum: ["sent", "failed"], default: "sent" },
  error: { type: String },                       // error message if failed
  sentAt: { type: Date, default: Date.now },     // timestamp
});

module.exports = mongoose.model("EmailLog", emailLogSchema);
