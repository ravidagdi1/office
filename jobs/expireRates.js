const SupplierRateMaster = require("../models/SupplierRateMaster");
const QuotationReply = require("../models/QuotationReply");
const QuotationApprovalLog = require("../models/quotationApprovalLogModel");
const Quotation = require("../models/Quotation");
const mongoose = require("mongoose");

const SYSTEM_USER_ID = new mongoose.Types.ObjectId("698f7db819a96118910c2af7");

const expireOldRatesAndQuotations = async () => {
  try {
    const now = new Date();

    /* =====================================================
       🔴 EXPIRE RATE MASTER
    ===================================================== */

    const expiringRates = await SupplierRateMaster.find({
      validTo: { $lt: now },
      status: "Active"
    });

    for (const rate of expiringRates) {
      await SupplierRateMaster.updateOne(
        { _id: rate._id },
        { $set: { status: "Expired" } }
      );

      await QuotationReply.updateMany(
        {
          partNo: rate.partNo,
          supplierId: rate.supplierId,
          status: "Approved"
        },
        { $set: { status: "Expired" } }
      );

      await QuotationApprovalLog.create({
        partNo: rate.partNo,
        supplierId: rate.supplierId,
        rate: rate.rate,
        unit: rate.unit,
        source: rate.source,
        expiryDate: rate.validTo,
        action: "Expired",
        previousStatus: "Approved",
        newStatus: "Expired",
        actionBy: SYSTEM_USER_ID
      });
    }

    /* =====================================================
       ⏳ AUTO EXPIRE QUOTATIONS
    ===================================================== */

    const expiredQuotations = await Quotation.find({
      expiryDate: { $lt: now },
      status: { $in: ["Sent", "Partially-Replied"] }
    });

    for (const quote of expiredQuotations) {
      await Quotation.updateOne(
        { _id: quote._id },
        { $set: { status: "Expired" } }
      );
    }

  } catch (err) {
    console.error("CRON expiry failed:", err);
  }
};

module.exports = expireOldRatesAndQuotations;
