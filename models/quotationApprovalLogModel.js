const mongoose = require("mongoose");

const quotationApprovalLogSchema = new mongoose.Schema({

  partNo: String,

  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuppliersDetails"
  },

  rate: Number,
  unit: String,

  source: String,              // WhatsApp / Manual / API

  action: {
    type: String,
    enum: ["Approved", "Expired", "Reactivated"],
    required: true
  },

  previousStatus: String,     // Approved / Expired
  newStatus: String,          // Expired / Active

  expiryDate: Date,

  actionBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  actionAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("QuotationApprovalLog",quotationApprovalLogSchema);
