const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
  // Create transporter using Gmail
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST2,   // smtp.gmail.com
    port: process.env.EMAIL_PORT2,   // 465
    secure: true, // Gmail requires SSL on port 465
    auth: {
      user: process.env.EMAIL_USER2, // Gmail user
      pass: process.env.EMAIL_PASS2  // App password
    },
  });
  console.log("smpt connected to send email")

  // Email options
  const mailOptions = {
    from: `"PO System" <${process.env.EMAIL_USER2}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html || undefined,
  };

  // Send email
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
