const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendWhatsApp = async ({ to, message }) => {
  return client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER, // sandbox
    to: `whatsapp:${to}`,
    body: message
  });
};
