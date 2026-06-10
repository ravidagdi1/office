const mongoose = require('mongoose');

const repairMrvFormSchema = new mongoose.Schema(
  {
    // ================================
    // Repair MRV Number
    // ================================
    repairMrvNo: {
      type: Number,
      unique: true,
      required: [true, 'Repair MRV must have a number']
    },

    // ================================
    // Document / Image
    // ================================
    image: {
      type: String
    },

    // ================================
    // Store
    // ================================
    store: {
      type: mongoose.Schema.ObjectId,
      ref: 'Store',
      required: [true, 'Please select store']
    },

    // ================================
    // User who created MRV
    // ================================
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Please select user']
    },

    // ================================
    // Supplier (REQUIRED – SAME AS NORMAL MRV)
    // ================================
    supplier: {
      type: mongoose.Schema.ObjectId,
      ref: 'SuppliersDetails',
      required: [true, 'Please select supplier']
    },

    // ================================
    // Status
    // ================================
    status: {
      type: String,
      default: 'open',
      enum: ['open', 'submit', 'close', 'forceClosed']
    },

    // ================================
    // Billing Details
    // ================================
    billingNo: {
      type: Number,
    
    },

    billingTitle: {
      type: String
    },

    billingDate: {
      type: Date
    },

    // ================================
    // Amount Details
    // ================================
    totalAmount: {
      type: Number,
      default: 0
    },

    otherCharges: {
      type: Number,
      default: 0
    },

    // ================================
    // Item Count
    // ================================
    itemCount: {
      type: Number,
      required: [true, 'Please enter item count'],
      min: [1, 'Item count must be at least 1']
    },

    // ================================
    // Active Flag
    // ================================
    active: {
      type: Boolean,
      default: true,
      select: true
    }
  },
  {
    timestamps: true
  }
);

// ======================================================
// AUTO POPULATE REFERENCES
// ======================================================
repairMrvFormSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'store',
    select: '-__v'
  })
  .populate({
    path: 'user',
    select: '-__v -password -active'
  })
  .populate({
    path: 'supplier',
    select: 'name city state _id'
  });

  next();
});

// ======================================================
// MODEL EXPORT
// ======================================================
const RepairMrv = mongoose.model('RepairMrv', repairMrvFormSchema);
module.exports = RepairMrv;
