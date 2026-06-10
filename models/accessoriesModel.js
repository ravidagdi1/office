const mongoose = require('mongoose');

const accessorySchema = new mongoose.Schema({
  // Reference to main item type (from MasterList, e.g. Mouse, Keyboard)
  masterItem: {
    type: mongoose.Schema.ObjectId,
    ref: 'MasterList',
    required: [true, 'Please select a master item (e.g. Mouse, Keyboard)!']
  },

  // Accessory-specific fields
  name: {
    type: String,
    required: [true, 'Please enter accessory name (e.g. Dell Mouse)!']
  },

  model: {
    type: String,
    required: [true, 'Please provide the model name or number!']
  },

  brand: {
    type: String
  },

  serialNo: {
    type: String,
    unique: false
  },

  purchaseDate: {
    type: Date
  },

  warrantyExpiry: {
    type: Date
  },

  vendor: {
    type: String
  },

  // Optional link to a specific asset (e.g. HP Laptop → HP Mouse)
  linkedAsset: {
    type: mongoose.Schema.ObjectId,
    ref: 'Asset',
    default: null
  },

  assignedTo: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },

  status: {
    type: String,
    enum: ['inStock', 'assigned', 'damaged', 'disposed'],
    default: 'inStock'
  },

  location: {
    type: String
  },

  remark: String,

  active: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Auto populate related references
accessorySchema.pre(/^find/, function(next) {
  if (this.getOptions().skipPopulate) return next();
  this.populate('masterItem', 'partNo description category unit')
      .populate('linkedAsset', 'name model brand serialNo')
      .populate('assignedTo', 'name department');
  next();
});

const Accessory = mongoose.model('Accessory', accessorySchema);
module.exports = Accessory;
