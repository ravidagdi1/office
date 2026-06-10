const QuotationReply = require("../models/QuotationReply");
const QuotationApprovalLog = require("../models/QuotationApprovalLog");

exports.autoExpireQuotes = async () => {
  const expired = await QuotationReply.find({
    status: "Approved",
    expiryDate: { $lt: new Date() }
  });

  for (const quote of expired) {
    quote.status = "Expired";
    await quote.save();

    await QuotationApprovalLog.create({
      partNo: quote.partNo,
      supplierId: quote.supplierId,
      rate: quote.rate,
      unit: quote.unit,
      action: "Expired",
      expiryDate: quote.expiryDate
    });
  }
};
