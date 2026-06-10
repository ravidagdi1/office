const mongoose = require('mongoose');

const waterDetailsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  gateEntryNo: {
    type: String,
    required: [true, 'Gate Entry Number is required'],
    trim: true,
  },
  inTime: {
    type: String,
    required: [true, 'In Time is required'],
  },
  outTime: {
    type: String,
    required: [true, 'Out Time is required'],
  },
  supplierName: {
    type: String,
    required: [true, 'Supplier Name is required'],
    trim: true,
  },
  mrv: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mrv',
    required: [true, 'MRV reference is required'],
  },
  miv: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Miv',
    required: [true, 'MIV reference is required'],
  },
  description: {
    type: String,
    trim: true,
  },
  invoiceOrChallanNo: {
    type: String,
    trim: true,
  },
  vehicleNo: {
    type: String,
    required: [true, 'Vehicle Number is required'],
    trim: true,
  },
  uom: {
    type: String,
    required: [true, 'Unit of Measurement is required'],
    trim: true,
  },
  qty: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0.1, 'Quantity must be positive'],
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('WaterDetail', waterDetailsSchema);
