const mongoose = require('mongoose');

const billingAddressSchema = new mongoose.Schema({
  state: {
    type: String,
    required: [true, 'State is required'],
    trim: true
  },
  stateCode: {
    type: String,
    required: [true, 'State Code is required'],
    trim: true,
  },
  gstNumber: {
    type: String,
    required: [true, 'GST Number is required'],
    trim: true,
    uppercase: true,
    match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/, 'Invalid GST Number format']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true
  },
  status:{
    type:String,
    default:'active'
  }
}); // ← missing closing parenthesis

const BillingModel = mongoose.model('Billing', billingAddressSchema);

module.exports = BillingModel; // ✅ Export the model properly
