const mongoose = require('mongoose');

const suppliersDetailsSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    street: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true }
  },
  mobileNo: [{
    type: String,
    required: true,
    trim: true
  }],
  email: [{
    type: String,
    required: true,
    trim: true,
    lowercase: true
  }],
  status: {
    type: String,
    default: 'active',
    enum: {
      values: ['active', 'inactive'],
      message: 'Status is either: active, inactive!'
    }
  },
  GSTNo: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('SuppliersDetails', suppliersDetailsSchema);
