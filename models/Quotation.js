const mongoose = require("mongoose");

const supplierQuoteSchema = new mongoose.Schema({
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuppliersDetails", // ✅ match actual model
    required: true
  },
  supplierName: String,
  phone: String,

  status: {
    type: String,
    enum: ["Sent", "Replied"],
    default: "Sent"
  },
  repliedAt: {
  type: Date
}

});

const quotationSchema = new mongoose.Schema(
  {
    requisitionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Request",
      required: true
    },

    requisitionNo: {
      type: Number,
      required: true
    },

    batchNo: {
      type: Number,
      required: true       // 🔥 REQUIRED for WhatsApp replies
    },
    status: {
      type: String,
      enum: ["Sent", "Partially-Replied", "Completed", "Expired"],
      default: "Sent"
    },
    reminderSent: {
      type: Boolean,
      default: false
    },

expiryDate: {
      type: Date,
      required: true   // RFQ must always have validity
    },

    repliedAt: {
      type: Date
    },

    lastReminderAt: {
      type: Date
    },

    items: [
      {
        partNo: String,
        description: String,
        requiredQty: Number,
        approvedQty: Number
      }
    ],

    suppliers: [supplierQuoteSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },

  },

  { timestamps: true }
);



module.exports = mongoose.model("Quotation", quotationSchema);
