const mongoose = require("mongoose");

const supplierRateMasterSchema = new mongoose.Schema({

  partNo: { type: String, required: true },

  
  description: {                 // ✅ NEW (ERP standard)
    type: String,
    required: true
  },

  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "SuppliersDetails",
    required: true
  },

  rate: { type: Number, required: true },

  unit: String,

  validFrom: { type: Date, default: Date.now },

  validTo: Date,

  isPreferred: {
    type: Boolean,
    default: false
  },
status: {
  type: String,
  enum: ["Active", "Expired"],
  default: "Active"
}


}, { timestamps: true });

supplierRateMasterSchema.index(
  { partNo: 1, supplierId: 1, validTo: 1 }
);

module.exports = mongoose.model("SupplierRateMaster", supplierRateMasterSchema);
