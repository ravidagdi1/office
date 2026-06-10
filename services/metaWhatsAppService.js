const axios = require("axios");

const WHATSAPP_API = "https://graph.facebook.com/v22.0";

// Shared headers for all WhatsApp API requests
const headers = {
  Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
  "Content-Type": "application/json"
};

/* ------------------------------------------------ */
/* SEND TEMPLATE MESSAGE (Quotation Request) */
/* ------------------------------------------------ */

exports.sendWhatsAppTemplate = async ({
  to,
  requisitionNo,
  batchNo,
  expiryDate,
  itemText
}) => {

  try {

    // Normalize phone number
    const phone = String(to).replace(/\D/g, "");

    const response = await axios.post(
      `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: "quotationrequest", // Must match template name exactly
          language: { code: "en" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: requisitionNo.toString() },
                { type: "text", text: batchNo.toString() },
                { type: "text", text: expiryDate },
                { type: "text", text: itemText }
              ]
            }
          ]
        }
      },
      {
        headers,
        timeout: 10000
      }
    );

    console.log("✅ WhatsApp template sent:", response.data);

    return response.data;

  } catch (error) {

    const err = error.response?.data || error.message;

    console.error("❌ WhatsApp template error:", err);

    throw new Error(
      err?.error?.message || "WhatsApp template send failed"
    );

  }
};


/* ------------------------------------------------ */
/* SEND NORMAL TEXT MESSAGE (Auto Replies) */
/* ------------------------------------------------ */

exports.sendWhatsAppText = async ({ to, message }) => {

  try {

    const phone = String(to).replace(/\D/g, "");

    const response = await axios.post(
      `${WHATSAPP_API}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: {
          body: message
        }
      },
      {
        headers,
        timeout: 10000
      }
    );

    console.log("✅ WhatsApp text sent:", response.data);

    return response.data;

  } catch (error) {

    const err = error.response?.data || error.message;

    console.error("❌ WhatsApp text error:", err);

    throw new Error(
      err?.error?.message || "WhatsApp text send failed"
    );

  }
};