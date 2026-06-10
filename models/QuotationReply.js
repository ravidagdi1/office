const mongoose = require("mongoose");

const quotationReplySchema = new mongoose.Schema({
  requisitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Request",
    required: true
  },

  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuppliersDetails",
    required: true
  },

  batchNo: {
    type: Number,
    required: true
  },

  partNo: {
    type: String,
    required: true
  },

  revision: {
    type: Number,
    required: true
  },

  rate: {
    type: Number,
    required: true
  },

  unit: {
    type: String,
    default: ""
  },

  status: {
    type: String,
    enum: ["Pending", "Received", "Approved", "Expired"],
    default: "Pending"
  },

  receivedAt: {
    type: Date,
    default: Date.now
  },

  approvedAt: Date,

  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },

  expiryDate: Date,

  source: {
    type: String,
    enum: ["WhatsApp", "Manual"],
    default: "Manual"
  }

},
{ timestamps: true }
);

/* ✅ UNIQUE PER REVISION */
quotationReplySchema.index(
  {
    requisitionId: 1,
    supplierId: 1,
    batchNo: 1,
    partNo: 1,
    revision: 1
  },
  { unique: true }
);

module.exports = mongoose.model("QuotationReply", quotationReplySchema);
