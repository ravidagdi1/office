const PurchaseOrder = require("../models/PurchaseOrder");
const User = require("../models/userModel");
const sendEmail = require("./sendGrid");
const EmailLog = require("../models/emailLogModel"); // new

exports.sendPOEmailsService = async () => {
  const statusRoleMap = {
    "Assigned-To-SuperAdmin": "superAdmin",
    "Assigned-To-Checker": "pochecker",
    "Assigned-To-Maker": "pomaker",
  };

  const result = {};

  for (const [status, role] of Object.entries(statusRoleMap)) {
    const pos = await PurchaseOrder.find({ status });
    if (!pos.length) continue;

    const users = await User.find({ role, status: "active", emailFlag: true });
    if (!users.length) continue;

    const poRows = pos.map(po => {
      // 🧠 Extract unique supplier names from all items
      const supplierNames = [
        ...new Set(po.items.map(it => it?.supplier?.name).filter(Boolean))
      ];

      return `
    <tr>
      <td>${po?.poNumber || "-"}</td>
      <td>${po?.requisitionNo?.store?.name}</td>
      <td>${po?.items?.length || 0}</td> <!-- ✅ Item count -->
      <td>${po?.totalAmount?.toLocaleString('en-IN', { style: 'currency', currency: 'INR' }) || "0.00"}</td>
      <td>${po?.status || "-"}</td>
      <td>${po?.createdBy?.name || "-"}</td>
      <td>${supplierNames.join(", ") || "-"}</td>  <!-- ✅ Show supplier(s) -->
      <td>${new Date(po?.createdAt).toLocaleString()}</td>
    </tr>
  `;
    }).join("");


    const poTable = `
      <h3>Purchase Orders Assigned to You (${status})</h3>
      <table border="1" cellspacing="0" cellpadding="5">
        <thead>
          <tr>
            <th>PO Number</th>
            <th>Store</th>
            <th>Items Count</th>
            <th>Total Amount</th>
            <th>Status</th>
            <th>Created By</th>
            <th>Supplier Name</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>${poRows}</tbody>
      </table>
      <p>Regards,<br>PO System</p>`;

    for (const user of users) {
      let emailStatus = "sent";
      let errorMessage = "";

      try {
        await sendEmail({
          email: user.email,
          subject: `New Purchase Orders Assigned for Action - ${status}`,
          message: `Hello ${user.name}, you have new POs assigned. Please check your dashboard.`,
          html: `<p>Hello ${user.name},</p>${poTable}`,
        });
      } catch (err) {
        emailStatus = "failed";
        errorMessage = err.message;
        console.error(`❌ Email failed to ${user.email}:`, err.message);
      }

      // Save log in MongoDB
      await EmailLog.create({
        to: user.email,
        subject: `New Purchase Orders Assigned - ${status}`,
        message: `Hello ${user.name}, you have new POs assigned.`,
        html: poTable,
        status: emailStatus,
        error: errorMessage,
      });
    }

    result[status] = {
      role,
      sentTo: users.map(u => u.email),
      purchaseOrders: pos.length,
    };
  }

  return result;
};
