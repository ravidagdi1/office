const mongoose = require('mongoose');

const billingDepartSchema = new mongoose.Schema(
  {
    totalOtherCharges: { type: Number, required: true, default: 0 },
    totalBillAmount: { type: Number, required: true, default: 0 },
    approvedAmount: { type: Number, default: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    status: { 
      type: String, 
      enum: ["submitted", "submittedToAccount", "completed"], 
      default: "submitted" 
    },

    mrvIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Mrv" }
    ],

    remarks: { type: String },

    otherDoc: { type: String },
  },
  { timestamps: true }
);

// Auto-populate MRVs & user
billingDepartSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'mrvIds',
    strictPopulate: false,
    populate: [
      { path: 'store', select: '-__v' },
      { path: 'user', select: '-password -__v -active' },
      { path: 'supplier', select: 'name city state _id' }
    ]
  })
  .populate('createdBy', 'name email role');

  next();
});

module.exports = mongoose.model('BillingDepart', billingDepartSchema);
