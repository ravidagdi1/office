const mongoose = require('mongoose');

const assetVehicleSchema = new mongoose.Schema({

  asset: {
    type: mongoose.Schema.ObjectId,
    ref: 'Asset',
    required: [true, 'Asset is required'],
    unique: true // keep if strictly 1 per asset
  },

  average: {
    type: Number,
    required: true,
    min: [1, 'Average must be greater than 0']
  },

  capacity: {
    type: Number,
    required: true,
    min: [1, 'Capacity must be greater than 0']
  },

  // ✅ NEW FIELD
  vehicleType: {
    type: String,
    enum: ['Rental', 'Purchased'],
    required: true
  },

  operators: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],

  isActive: {
    type: Boolean,
    default: true,
  },

}, { timestamps: true });

module.exports = mongoose.model('AssetVehicle', assetVehicleSchema);