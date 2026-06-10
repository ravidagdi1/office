const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async ({ email, subject, message, html }) => {
  const msg = {
    to: email,
    from: process.env.SENDGRID_SENDER, // must be verified sender
    subject,
    text: message,
    html: html || message,
  };

  try {
    const [response] = await sgMail.send(msg); // capture SendGrid response
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`✅ Email queued successfully to ${email}`);
      return { status: "sent", response: response.body };
    } else {
      console.error(`❌ Email not sent to ${email}`, response.body);
      return { status: "failed", error: response.body };
    }
  } catch (err) {
    console.error(`❌ Email failed to ${email}:`, err.response?.body || err.message);
    return { status: "failed", error: err.response?.body || err.message };
  }
};

module.exports = sendEmail;

