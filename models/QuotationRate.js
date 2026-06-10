const quotationRateSchema = new mongoose.Schema({
  requisitionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Requisition",
    required: true
  },

  quotationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Quotation",
    required: true
  },

  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier",
    required: true
  },

  supplierName: String,

  partNo: {
    type: String,
    required: true
  },

  description: String,

  requiredQty: Number,

  rate: {
    type: Number,
    required: true
  },

  totalAmount: Number, // rate * qty

  status: {
    type: String,
    enum: ["Quoted", "Approved", "Rejected"],
    default: "Quoted"
  },

  quotedAt: {
    type: Date,
    default: Date.now
  },

  approvedAt: Date,

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});
