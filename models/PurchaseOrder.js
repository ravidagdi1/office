const mongoose = require('mongoose');
const Counter = require('../models/counterModel');

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['Created', 'Updated', 'Assigned-To-Checker', 'Sent-Back', 'Approved', 'Rejected', 'Billing Record Created', 'Billing Record Linked (Migration)'],
    required: true
  },
  fromStatus: { type: String },
  toStatus: { type: String },
  remark: { type: String, default: '' },

  // 👇 Required for tracking
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },

  date: { type: Date, default: Date.now }
}, { _id: false });


const poSchema = new mongoose.Schema({
  deliveryAddress: {
    street: { type: String, required: [true, 'Street is required'] },
    city: { type: String, required: [true, 'City is required'] },
    state: { type: String, required: [true, 'State is required'] },
    pincode: { type: String, required: [true, 'Pincode is required'] },
    country: { type: String, required: [true, 'Country is required'] }
  },

  requisitionNo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Request',
    required: [true, 'Requisition number is required']
  },
  poType: {
    type: String,
    enum: ['Normal', 'FOC PO', 'Advance Payment'],
    default: 'Normal'
  },

  advanceRentalAmount: {
    type: Number,
    default: 0
  },

  advanceRentalPercent: {
    type: Number,
    default: 0
  },


  items: [{
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' }, // <-- new field
    partNo: { type: String, required: true },
    description: { type: String, required: true },
    unit: { type: String, required: true },
    fromUnit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },             // only if converted
    conversionValue: { type: Number }, // ✅ required only when fromUnit exists
    qtyRequired: { type: Number, required: true },
    approveQty: { type: Number, required: true },
    rate: { type: Number, required: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SuppliersDetails',
      required: true
    },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    mrv: { type: mongoose.Schema.Types.ObjectId, ref: 'Mrv' }
  }],

  totalAmount: { type: Number, required: true },

  // ✅ Status drives everything
  status: {
    type: String,
    enum: [
      'Generated',          // Maker created or re-submitted
      'Assigned-To-Maker',  // Sent back by Checker/Admin
      'Assigned-To-Checker',
      'Assigned-To-SuperAdmin',
      'Confirmed-Generated', // Final approval from Admin
      'Bill-Generated',
      'Rejected',
      'Cancelled',
      'Supplier-Denied',
      'Order-Received',
      'Partially-Received',
      'Completed',
      'PaymentPending',
      'In-Progress'     // ✅ ADD THIS
    ],
    default: 'Generated'
  },
  billingStatus: {
    type: String
  },

  billing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BillingDepart"
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  poNumber: { type: String, unique: true },

  totalCGSTAmount: { type: Number, default: 0 },
  totalSGSTAmount: { type: Number, default: 0 },
  totalIGSTAmount: { type: Number, default: 0 },
  totalItems: { type: Number, default: 0 },


  subject: { type: String },
  reference: { type: String },
  termCondition: [String],

  // ✅ Track every step
  history: [activitySchema]

}, { timestamps: true });

// Pre-save hook for generating poNumber
poSchema.pre('save', async function (next) {
  if (this.isNew && !this.poNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'purchaseOrder' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    this.poNumber = String(counter.seq).padStart(4, '0');
  }
  next();
});

// Auto-populate references
poSchema.pre(/^find/, function (next) {
  // ✅ skip populate if explicitly disabled
  if (this.getOptions().skipPopulate) {
    return next();
  }
  this.populate('requisitionNo', 'requisitionNo store department createdAt')
    .populate('items.supplier', 'name email mobile address contactPerson GSTNo mobileNo')
    .populate('createdBy', 'name email role')
    .populate('history.user', 'name email role')
    .populate('createdBy', 'name')
    .populate({
      path: 'billing',
      strictPopulate: false
    })


  next();
});



module.exports = mongoose.model('PurchaseOrder', poSchema);
