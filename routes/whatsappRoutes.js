const express = require("express");
const router = express.Router();

const webhookController = require("../controllers/whatsappWebhookController");

// Webhook verification (Meta checks this once)
router.get("/webhook", webhookController.verifyWebhook);

// Incoming WhatsApp messages
router.post("/webhook", webhookController.handleIncomingMessage);

module.exports = router;
