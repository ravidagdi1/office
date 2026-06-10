const mongoose = require('mongoose');

const castingSchema = new mongoose.Schema({
  masterItem: {
    type: mongoose.Schema.ObjectId,
    ref: 'MasterList',
    required: [true, 'Please Select Item !']
  },
  inventory: {
    type: mongoose.Schema.ObjectId,
    ref: 'Inventory',
    required: [true, 'Please Select Item !']
  },
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'A item must have a user']
  },
  storeName: {
    type: String
  },
  RequestNo: {
    type: Number
  },
  qtyRecived: {
    type: Number
  },
  approveQty: {
    type: Number
  },
  castingQty: {
    type: Number
  },
  unitName: {
    type: String
  },
  status: {
    type: String,
    default: 'completed',
    enum: {
      values: ['completed'],
      message: 'Status is completed'
    }
  },
  RequestType: {
    type: String
  },
  // NEW: Track changes to inventory values
  totalRecive: {
    old: Number,
    new: Number
  },
  totalMiv: {
    old: Number,
    new: Number
  },
  currentStock: {
    old: Number,
    new: Number
  },
  active: {
    type: Boolean,
    default: false,
    select: true
  }
}, {
  timestamps: true
});

castingSchema.pre(/^find/, function (next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate({
    path: 'inventory',
    select: '-__v -active -id'
  }).populate({
    path: 'masterItem',
    select: '-__v'
  }).populate({
    path: 'user',
    select: '-__v -active -id -password'
  });

  next();
});

const Casting = mongoose.model('Casting', castingSchema);

module.exports = Casting;
