const mongoose = require("mongoose");

const qtyIncreaseRequestSchema = new mongoose.Schema(
  {
    // Item Reference
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },

    // Requisition Reference
    requisitionId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Request",
  required: true,
},

    // Current Approved Qty
    currentApprovedQty: {
      type: Number,
      default: 0,
    },

    // PO Team Requested Qty
    newRequiredQty: {
      type: Number,
      required: true,
    },

    // Director Approved Qty
    approvedByDirectorQty: {
      type: Number,
      default: 0,
    },

    // Status
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    // Optional Remarks
    remarks: {
      type: String,
      default: "",
    },

    // Who Created Request
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Director Approval User
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "QtyIncreaseRequest",
  qtyIncreaseRequestSchema
);