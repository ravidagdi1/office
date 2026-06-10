const mongoose = require('mongoose');
const Counter = require('../models/counterModel');

const activitySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'Created',
      'Updated',
      'Assigned-To-Checker',
      'Sent-Back',
      'Approved',
      'Rejected',
      'Billing Record Created',
      'Billing Record Linked (Migration)'
    ],
    required: true
  },

  fromStatus: String,
  toStatus: String,
  remark: { type: String, default: '' },

  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, required: true },

  date: { type: Date, default: Date.now }
}, { _id: false });



/* ============================================================
      REPAIR PURCHASE ORDER SCHEMA
============================================================ */
const repairPOSchema = new mongoose.Schema({

  /* LINK TO REPAIR REQUEST */
  repairOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepairRequest',
    required: true
  },

  poType: {
    type: String,
    enum: ['Normal', 'FOC PO'],
    default: 'Normal'
  },

  /* ITEMS (NO PARTNO/DESC/STORAGE — we fetch from RepairItem) */
  items: [{
    repairItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'RepairItem' },
     partNo: { type: String, required: true },
        description: { type: String, required: true },
        unit: { type: String, required: true },
        fromUnit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },             // only if converted
        conversionValue: { type: Number }, // ✅ required only when fromUnit exists
    qtyRequired: { type: Number, required: true },
    approveQty: { type: Number, required: true },

    rate: { type: Number, required: true },

    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  }],

  /* SUPPLIER (ONE PER PO) */
  supplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SuppliersDetails',
    required: true
  },

  /* TOTALS */
  totalAmount: { type: Number, required: true },
  totalCGSTAmount: { type: Number, default: 0 },
  totalSGSTAmount: { type: Number, default: 0 },
  totalIGSTAmount: { type: Number, default: 0 },
  totalItems: { type: Number, default: 0 },

  /* STATUS WORKFLOW */
  status: {
    type: String,
    enum: [
      'Generated',
      'Assigned-To-Maker',
      'Assigned-To-Checker',
      'Assigned-To-SuperAdmin',
      'Confirmed-Generated',
      'Bill-Generated',
      'Rejected',
      'Cancelled',
      'Order-Received',
      'Partially-Received',
      'Completed',
      'PaymentPending'
    ],
    default: 'Generated'
  },

  billingStatus: String,

  billing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "BillingDepart"
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  poNumber: { type: String, unique: true },

  subject: String,
  reference: String,
  termCondition: [String],

  history: [activitySchema]

}, { timestamps: true });



/* ============================================================
    AUTO-GENERATE PO NUMBER
============================================================ */
repairPOSchema.pre('save', async function (next) {
  if (this.isNew && !this.poNumber) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'repairPurchaseOrder' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    this.poNumber = String(counter.seq).padStart(4, '0');
  }
  next();
});



/* ============================================================
    AUTO POPULATE
============================================================ */
repairPOSchema.pre(/^find/, function (next) {

  this.populate({
    path: 'repairOrder',
    select: 'repairOrderNo store user status createdAt'
  })

  .populate({
    path: 'supplier',
    select: 'name GSTNo address email mobile'
  })

  .populate('createdBy', 'name email role')
  .populate('history.user', 'name email role')
  .populate({
    path: 'billing',
    strictPopulate: false
  });

  next();
});




module.exports = mongoose.model('RepairPurchaseOrder', repairPOSchema);
