const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  average: {
    type: Number,
    required: true,
  },
  category: {
    type: mongoose.Schema.ObjectId,
    ref: 'VechileCategory',
    required: [true, 'Category is required']
  },
  rentalStatus: {
    type: String,
    enum: ['Purchased', 'Rented'],
  },
  capacity: {
    type: Number, // Diesel capacity or load capacity
    required: true,
  },
  assignedStore: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store', // Reference to the Store model if relevant
  },
  assignedDrivers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to the Driver model
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

vehicleSchema.pre(/^find/, function (next) {

  // ✅ Check flag to skip populate
  if (this.getOptions().skipPopulate) {
    return next();
  }
  this.populate({
    path: 'assignedStore',
    select: '-__v -active -id'
  }).populate({
    path: 'category',  // Add this to populate the category
    select: '-__v'  // Optionally, you can exclude the __v field from the category
  });

  next();
});


module.exports = mongoose.model('Vehicle', vehicleSchema);
