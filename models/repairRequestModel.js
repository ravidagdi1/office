const mongoose = require('mongoose');

const repairSchema = new mongoose.Schema(
  {
    repairOrderNo: {
      type: Number,
      unique: [true, 'Repair Order No already exists'],
      required: [true, 'A repair order must have a repair order no']
    },

    // ✅ INVENTORY ADDED PROPERLY
    inventory: {
      type: mongoose.Schema.ObjectId,
      ref: 'Inventory',
      required: [true, 'Inventory item is required!']
    },

    store: {
      type: mongoose.Schema.ObjectId,
      ref: 'Store',
      required: [true, 'Please select a store!']
    },

    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'Please select a user!']
    },

    image: {
      type: String
    },

    status: {
      type: String,
      default: 'submit',
      enum: ['open', 'submit', 'adminSubmit', 'close', 'PO Pending']
    },

    active: {
      type: Boolean,
      default: true,
      select: true
    }
  },
  { timestamps: true }
);

// ✅ Auto populate
repairSchema.pre(/^find/, function (next) {
  this.populate({
    path: 'store',
    select: '-__v'
  })
    .populate({
      path: 'user',
      select: '-__v -password -active'
    })
    .populate({
      path: 'inventory',
      select: '-__v'
    });

  next();
});

module.exports = mongoose.model('RepairRequest', repairSchema);
