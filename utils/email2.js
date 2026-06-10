const nodemailer = require("nodemailer");

const sendEmail = async (options) => {
  // 1) Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST2,   // e.g. smtp.gmail.com
    port: process.env.EMAIL_PORT2,   // e.g. 465
    secure: true,                   // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER2, // your email
      pass: process.env.EMAIL_PASS2  // your email password / app password
    },
  });

  // 2) Define email options
  const mailOptions = {
    from: `"Support Team" <${process.env.EMAIL_USER2}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
  };

  // 3) Send email
  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;
